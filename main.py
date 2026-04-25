import os
import shutil
import signal
import subprocess
import logging
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("YTCast")

PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
NODE_BIN_SRC = os.path.join(PLUGIN_DIR, "bin", "node")
YTDLP_BIN_SRC = os.path.join(PLUGIN_DIR, "bin", "yt-dlp")
SERVER_JS = os.path.join(PLUGIN_DIR, "backend", "out", "server.js")

# Execute binaries from /tmp instead of from inside the plugin folder.
# Linux returns ETXTBSY if you try to overwrite an executable that's
# currently being executed — Decky's reinstall extractall hits this and
# hangs at the "Installing plugin" stage. Copying bin/node and bin/yt-dlp
# to /tmp once at startup means the plugin folder's bin/* are static
# files Decky can replace freely; the running processes hold the /tmp
# copies open, not the plugin folder ones.
RUNTIME_DIR = "/tmp/youtube-cast-receiver"
NODE_BIN = os.path.join(RUNTIME_DIR, "node")
YTDLP_BIN = os.path.join(RUNTIME_DIR, "yt-dlp")


def _stage_runtime_binaries():
    """Copy bin/node and bin/yt-dlp out of the plugin folder so the
    on-disk plugin files are never busy-executing during reinstall."""
    os.makedirs(RUNTIME_DIR, exist_ok=True)

    if os.path.exists(NODE_BIN_SRC):
        # If the previous run left a copy and it's not currently busy, replace.
        # On busy (a leftover Node from a crashed previous unload), fall back
        # to using the existing copy — it's the same binary anyway.
        try:
            shutil.copy2(NODE_BIN_SRC, NODE_BIN)
        except OSError as e:
            logger.warning(f"Could not refresh {NODE_BIN}: {e}; using existing copy")
        os.chmod(NODE_BIN, 0o755)

    if os.path.exists(YTDLP_BIN_SRC):
        try:
            shutil.copy2(YTDLP_BIN_SRC, YTDLP_BIN)
        except OSError as e:
            logger.warning(f"Could not refresh {YTDLP_BIN}: {e}; using existing copy")
        os.chmod(YTDLP_BIN, 0o755)


class Plugin:
    node_process = None

    async def _main(self):
        logger.info("Starting YouTube Cast Receiver backend...")

        # Stage binaries to /tmp so plugin-folder bin/* aren't busy-executing.
        _stage_runtime_binaries()

        try:
            # start_new_session=True puts Node (and any children it spawns,
            # like yt-dlp) into its own process group / session. This lets us
            # kill the entire group on _unload via os.killpg.
            #
            # YTCAST_YTDLP_PATH tells server.ts where the staged yt-dlp lives.
            env = {
                **os.environ,
                "NODE_ENV": "production",
                "YTCAST_YTDLP_PATH": YTDLP_BIN,
            }
            self.node_process = subprocess.Popen(
                [NODE_BIN, SERVER_JS],
                cwd=PLUGIN_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                start_new_session=True,
            )

            # Wait for READY signal (with timeout)
            loop = asyncio.get_running_loop()

            def wait_for_ready():
                if self.node_process and self.node_process.stdout:
                    for line in iter(self.node_process.stdout.readline, b""):
                        decoded = line.decode("utf-8", errors="replace").strip()
                        logger.info(f"[Node] {decoded}")
                        if decoded == "READY":
                            return True
                return False

            try:
                ready = await asyncio.wait_for(
                    loop.run_in_executor(None, wait_for_ready),
                    timeout=30.0
                )
                if ready:
                    logger.info("Backend is ready.")
                else:
                    logger.error("Backend process ended before signaling READY.")
            except asyncio.TimeoutError:
                logger.error("Backend did not signal READY within 30 seconds.")
                await self._terminate_process_group()
                return

            # Continue reading stdout and stderr in background for logging
            async def log_stream(stream, level_fn):
                if stream:
                    while True:
                        line = await loop.run_in_executor(None, stream.readline)
                        if not line:
                            break
                        level_fn(f"[Node] {line.decode('utf-8', errors='replace').strip()}")

            asyncio.ensure_future(log_stream(self.node_process.stdout, logger.info))
            asyncio.ensure_future(log_stream(self.node_process.stderr, logger.warning))

        except Exception as e:
            logger.error(f"Failed to start backend: {e}")

    async def _terminate_process_group(self):
        """Kill the Node process group (Node + any children like yt-dlp)
        with bounded, non-blocking waits. Safe to call on already-dead procs."""
        if not self.node_process:
            return

        pid = self.node_process.pid
        loop = asyncio.get_running_loop()

        try:
            pgid = os.getpgid(pid)
        except ProcessLookupError:
            self.node_process = None
            return

        # SIGTERM the whole group, give it 2s to clean up
        try:
            os.killpg(pgid, signal.SIGTERM)
        except ProcessLookupError:
            self.node_process = None
            return

        try:
            await asyncio.wait_for(
                loop.run_in_executor(None, self.node_process.wait),
                timeout=2.0,
            )
        except asyncio.TimeoutError:
            logger.warning("Backend did not stop gracefully, force-killing process group...")
            try:
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(
                    loop.run_in_executor(None, self.node_process.wait),
                    timeout=3.0,
                )
            except asyncio.TimeoutError:
                logger.error("Backend process did not exit even after SIGKILL")

        # Belt-and-suspenders: send one more SIGKILL to the process group
        # in case any orphaned grandchildren are still alive.
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass

        # Brief grace for the kernel to reap stragglers.
        await asyncio.sleep(0.2)

        self.node_process = None

    async def _unload(self):
        logger.info("Stopping YouTube Cast Receiver backend...")
        try:
            await self._terminate_process_group()
        except Exception as e:
            logger.error(f"Error stopping backend: {e}")
        logger.info("Backend stopped.")
