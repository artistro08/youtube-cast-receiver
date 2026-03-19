import os
import signal
import subprocess
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("YTCast")

PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
NODE_BIN = os.path.join(PLUGIN_DIR, "bin", "node")
SERVER_JS = os.path.join(PLUGIN_DIR, "backend", "out", "server.js")


class Plugin:
    node_process = None

    async def _main(self):
        logger.info("Starting YouTube Cast Receiver backend...")

        # Kill any leftover Node.js process from a previous install/reload
        # that wasn't properly unloaded (e.g. reinstall without uninstall)
        if self.node_process:
            try:
                self.node_process.kill()
                self.node_process.wait(timeout=2)
            except Exception:
                pass
            self.node_process = None

        # Also kill any orphaned process on our port
        try:
            result = subprocess.run(
                ["fuser", "-k", "39281/tcp"],
                capture_output=True, timeout=5
            )
            if result.returncode == 0:
                logger.info("Killed orphaned process on port 39281")
        except Exception:
            pass

        # Ensure node binary is executable
        if os.path.exists(NODE_BIN):
            os.chmod(NODE_BIN, 0o755)

        yt_dlp_bin = os.path.join(PLUGIN_DIR, "bin", "yt-dlp")
        if os.path.exists(yt_dlp_bin):
            os.chmod(yt_dlp_bin, 0o755)

        try:
            self.node_process = subprocess.Popen(
                [NODE_BIN, SERVER_JS],
                cwd=PLUGIN_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**os.environ, "NODE_ENV": "production"},
            )

            # Wait for READY signal (with timeout)
            import asyncio
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

    async def _unload(self):
        logger.info("Stopping YouTube Cast Receiver backend...")
        if self.node_process:
            try:
                self.node_process.send_signal(signal.SIGTERM)
                try:
                    self.node_process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    logger.warning("Backend did not stop gracefully, killing...")
                    self.node_process.kill()
                    self.node_process.wait(timeout=2)
            except Exception as e:
                logger.error(f"Error stopping backend: {e}")
            finally:
                self.node_process = None
        logger.info("Backend stopped.")
