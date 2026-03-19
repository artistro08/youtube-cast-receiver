import { spawn } from 'node:child_process';

export interface AudioInfo {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  duration: number;
  url: string;
}

export function extractAudioInfo(videoId: string, ytdlpPath: string): Promise<AudioInfo> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ytdlpPath,
      ['-f', 'bestaudio[ext=m4a]/bestaudio', '-j', '--no-playlist', '--', videoId],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        resolve({
          videoId: data.id ?? videoId,
          title: data.title ?? 'Unknown',
          artist: data.uploader ?? data.channel ?? 'Unknown',
          albumArt: data.thumbnail ?? '',
          duration: data.duration ?? 0,
          url: data.url ?? '',
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp output: ${(err as Error).message}`));
      }
    });
  });
}

export function selfUpdate(ytdlpPath: string): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn(ytdlpPath, ['-U'], { stdio: 'ignore' });
    proc.on('close', () => resolve());
    proc.on('error', () => resolve()); // Fail silently
  });
}
