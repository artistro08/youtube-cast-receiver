import os
import signal
import subprocess
import logging
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("YTCast")

PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
NODE_BIN = os.path.join(PLUGIN_DIR, "bin", "node")
SERVER_JS = os.path.join(PLUGIN_DIR, "backend", "out", "server.js")


class Plugin:
    node_process = None

    async def _main(self):
        logger.info("Starting YouTube Cast Receiver backend...")

        # Ensure node binary is executable
        if os.path.exists(NODE_BIN):
            os.chmod(NODE_BIN, 0o755)

        yt_dlp_bin = os.path.join(PLUGIN_DIR, "bin", "yt-dlp")
        if os.path.exists(yt_dlp_bin):
            os.chmod(yt_dlp_bin, 0o755)

        try:
            # start_new_session=True puts Node (and any children it spawns,
            # like yt-dlp) into its own process group / session. This lets us
            # kill the entire group on _unload, so orphaned yt-dlp processes
            # don't keep bin/yt-dlp open and block Decky's reinstall extract.
            self.node_process = subprocess.Popen(
                [NODE_BIN, SERVER_JS],
                cwd=PLUGIN_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**os.environ, "NODE_ENV": "production"},
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
            self.node_process = None
            return
        except asyncio.TimeoutError:
            logger.warning("Backend did not stop gracefully, force-killing process group...")

        # SIGKILL fallback — give it 3s to actually exit (normally instant)
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
        finally:
            self.node_process = None

    async def _unload(self):
        logger.info("Stopping YouTube Cast Receiver backend...")
        try:
            await self._terminate_process_group()
        except Exception as e:
            logger.error(f"Error stopping backend: {e}")
        logger.info("Backend stopped.")
