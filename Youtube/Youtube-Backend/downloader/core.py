# downloader/core.py
import yt_dlp
import os
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Callable
import uuid

from .filters import VideoFilter
from .duplicate_detector import DuplicateDetector
from .metadata_handler import MetadataHandler


class DownloadProgress:
    """Track download progress for a single item."""
    
    def __init__(self, url: str, title: str = "Unknown"):
        self.id = str(uuid.uuid4())[:8]
        self.url = url
        self.title = title
        self.status = "pending"  # pending, downloading, processing, completed, error, skipped
        self.progress = 0
        self.speed = ""
        self.eta = ""
        self.error = None
        self.file_path = None
        self.metadata = {}
        self.started_at = None
        self.completed_at = None
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "status": self.status,
            "progress": self.progress,
            "speed": self.speed,
            "eta": self.eta,
            "error": self.error,
            "file_path": self.file_path,
            "metadata": self.metadata,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class DownloadJob:
    """Represents a download job containing multiple URLs."""
    
    def __init__(self, name: str, urls: List[str], format_type: str, settings: dict):
        self.id = str(uuid.uuid4())[:8]
        self.name = name
        self.urls = urls
        self.format_type = format_type
        self.settings = settings
        self.downloads: List[DownloadProgress] = []
        self.status = "pending"  # pending, running, completed, cancelled
        self.created_at = datetime.now()
        self.started_at = None
        self.completed_at = None
        
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "urls": self.urls,
            "format_type": self.format_type,
            "status": self.status,
            "downloads": [d.to_dict() for d in self.downloads],
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "total": len(self.urls),
            "completed_count": sum(1 for d in self.downloads if d.status == "completed"),
            "error_count": sum(1 for d in self.downloads if d.status == "error"),
            "skipped_count": sum(1 for d in self.downloads if d.status == "skipped"),
        }


class DownloadManager:
    """Manages all download operations with multi-threading support."""
    
    def __init__(self, config, socketio=None):
        self.config = config
        self.socketio = socketio
        self.video_filter = VideoFilter()
        self.duplicate_detector = DuplicateDetector(config.HISTORY_FILE)
        self.metadata_handler = MetadataHandler()
        
        self.jobs: Dict[str, DownloadJob] = {}
        self.executor: Optional[ThreadPoolExecutor] = None
        self.settings = self._load_settings()
        self._lock = threading.Lock()
        
        # Ensure directories exist
        config.init_directories()
    
    def _load_settings(self) -> dict:
        """Load settings from file or use defaults."""
        settings_file = self.config.SETTINGS_FILE
        if settings_file.exists():
            try:
                with open(settings_file, 'r') as f:
                    return {**self.config.DEFAULT_SETTINGS, **json.load(f)}
            except Exception:
                pass
        return self.config.DEFAULT_SETTINGS.copy()
    
    def save_settings(self, new_settings: dict):
        """Save settings to file."""
        self.settings.update(new_settings)
        with open(self.config.SETTINGS_FILE, 'w') as f:
            json.dump(self.settings, f, indent=2)
    
    def get_settings(self) -> dict:
        """Get current settings."""
        return self.settings.copy()
    
    def _emit_progress(self, event: str, data: dict):
        """Emit progress updates via WebSocket."""
        if self.socketio:
            self.socketio.emit(event, data)
    
    def _get_ydl_opts(self, format_type: str, output_folder: Path, progress_callback: Callable = None) -> dict:
        """Build yt-dlp options based on format and settings."""
        
        output_template = str(output_folder / "%(title)s.%(ext)s")
        
        base_opts = {
            'outtmpl': output_template,
            'ignoreerrors': True,
            'no_warnings': False,
            'extract_flat': False,
            'writeinfojson': self.settings.get('extract_metadata', True),
            'writethumbnail': self.settings.get('embed_thumbnail', True),
            'writesubtitles': self.settings.get('download_subtitles', False),
            'subtitleslangs': [self.settings.get('preferred_subtitle_lang', 'en')],
            'quiet': False,
            'no_color': True,
        }
        
        if progress_callback:
            base_opts['progress_hooks'] = [progress_callback]
        
        if format_type == 'mp3':
            base_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [
                    {
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': self.settings.get('audio_quality', '192'),
                    },
                    {
                        'key': 'FFmpegMetadata',
                        'add_metadata': True,
                    },
                ],
            })
            if self.settings.get('embed_thumbnail', True):
                base_opts['postprocessors'].append({
                    'key': 'EmbedThumbnail',
                })
        else:  # mp4
            quality = self.settings.get('video_quality', 'best')
            if quality == 'best':
                format_str = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
            elif quality == '1080p':
                format_str = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]'
            elif quality == '720p':
                format_str = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]'
            elif quality == '480p':
                format_str = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]'
            else:
                format_str = 'best'
            
            base_opts.update({
                'format': format_str,
                'merge_output_format': 'mp4',
                'postprocessors': [
                    {
                        'key': 'FFmpegVideoConvertor',
                        'preferedformat': 'mp4',
                    },
                    {
                        'key': 'FFmpegMetadata',
                        'add_metadata': True,
                    },
                ],
            })
        
        return base_opts
    
    def extract_info(self, url: str) -> Optional[dict]:
        """Extract video information without downloading."""
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info
        except Exception as e:
            return {'error': str(e)}
    
    def search_videos(self, query: str, site: str = "youtube", max_results: int = 20) -> List[dict]:
        """Search for videos across supported platforms."""
        search_url = f"ytsearch{max_results}:{query}" if site == "youtube" else f"{site}search{max_results}:{query}"
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'force_generic_extractor': False,
        }
        
        results = []
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(search_url, download=False)
                if info and 'entries' in info:
                    for entry in info['entries']:
                        if entry:
                            results.append({
                                'id': entry.get('id', ''),
                                'title': entry.get('title', 'Unknown'),
                                'url': entry.get('url') or entry.get('webpage_url', ''),
                                'duration': entry.get('duration', 0),
                                'thumbnail': entry.get('thumbnail', ''),
                                'channel': entry.get('channel', entry.get('uploader', 'Unknown')),
                                'view_count': entry.get('view_count', 0),
                            })
        except Exception as e:
            print(f"Search error: {e}")
        
        return results
    
    def _should_skip(self, info: dict) -> tuple:
        """Check if video should be skipped based on filters."""
        title = info.get('title', '')
        duration = info.get('duration', 0) or 0
        url = info.get('webpage_url', info.get('url', ''))
        
        # Check title exclusions
        exclude_keywords = self.settings.get('exclude_keywords', [])
        for keyword in exclude_keywords:
            if keyword.lower() in title.lower():
                return True, f"Title contains excluded keyword: {keyword}"
        
        # Check duration limits
        max_length = self.settings.get('max_video_length', 3600)
        min_length = self.settings.get('min_video_length', 0)
        
        if duration > max_length:
            return True, f"Duration ({duration}s) exceeds maximum ({max_length}s)"
        if duration < min_length:
            return True, f"Duration ({duration}s) below minimum ({min_length}s)"
        
        # Check for duplicates
        if self.duplicate_detector.is_duplicate(url, title):
            return True, "Already downloaded (duplicate detected)"
        
        return False, None
    
    def _download_single(self, url: str, format_type: str, download_progress: DownloadProgress) -> bool:
        """Download a single video/audio."""
        download_progress.started_at = datetime.now()
        download_progress.status = "downloading"
        
        # Determine output folder
        if format_type == 'mp3':
            output_folder = self.config.DOWNLOAD_FOLDER_MP3
        else:
            output_folder = self.config.DOWNLOAD_FOLDER_MP4
        
        def progress_hook(d):
            if d['status'] == 'downloading':
                download_progress.status = "downloading"
                
                # Calculate progress percentage
                if d.get('total_bytes'):
                    download_progress.progress = int((d.get('downloaded_bytes', 0) / d['total_bytes']) * 100)
                elif d.get('total_bytes_estimate'):
                    download_progress.progress = int((d.get('downloaded_bytes', 0) / d['total_bytes_estimate']) * 100)
                
                download_progress.speed = d.get('_speed_str', '')
                download_progress.eta = d.get('_eta_str', '')
                
                self._emit_progress('download_progress', download_progress.to_dict())
                
            elif d['status'] == 'finished':
                download_progress.status = "processing"
                download_progress.progress = 100
                download_progress.file_path = d.get('filename', '')
                self._emit_progress('download_progress', download_progress.to_dict())
        
        try:
            # First, extract info to check filters
            with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if not info:
                    raise Exception("Could not extract video information")
                
                download_progress.title = info.get('title', 'Unknown')
                download_progress.metadata = {
                    'title': info.get('title'),
                    'duration': info.get('duration'),
                    'uploader': info.get('uploader'),
                    'upload_date': info.get('upload_date'),
                    'description': info.get('description', '')[:500],
                    'thumbnail': info.get('thumbnail'),
                    'view_count': info.get('view_count'),
                }
                
                # Handle playlists
                if 'entries' in info:
                    # It's a playlist, process each entry
                    return self._handle_playlist(info, format_type, download_progress)
                
                # Check if should skip
                should_skip, reason = self._should_skip(info)
                if should_skip:
                    download_progress.status = "skipped"
                    download_progress.error = reason
                    download_progress.completed_at = datetime.now()
                    self._emit_progress('download_progress', download_progress.to_dict())
                    return False
            
            # Proceed with download
            ydl_opts = self._get_ydl_opts(format_type, output_folder, progress_hook)
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            
            # Mark as completed
            download_progress.status = "completed"
            download_progress.progress = 100
            download_progress.completed_at = datetime.now()
            
            # Record in history
            self.duplicate_detector.add_to_history(url, download_progress.title, download_progress.file_path)
            
            self._emit_progress('download_progress', download_progress.to_dict())
            return True
            
        except Exception as e:
            download_progress.status = "error"
            download_progress.error = str(e)
            download_progress.completed_at = datetime.now()
            self._emit_progress('download_progress', download_progress.to_dict())
            return False
    
    def _handle_playlist(self, info: dict, format_type: str, parent_progress: DownloadProgress) -> bool:
        """Handle playlist downloads."""
        entries = info.get('entries', [])
        playlist_title = info.get('title', 'Playlist')
        
        parent_progress.title = f"Playlist: {playlist_title}"
        parent_progress.metadata['playlist_count'] = len(entries)
        
        success_count = 0
        for i, entry in enumerate(entries):
            if entry and entry.get('url'):
                url = entry.get('url') or entry.get('webpage_url')
                child_progress = DownloadProgress(url, entry.get('title', f'Video {i+1}'))
                
                # Update parent progress
                parent_progress.progress = int((i / len(entries)) * 100)
                self._emit_progress('download_progress', parent_progress.to_dict())
                
                if self._download_single(url, format_type, child_progress):
                    success_count += 1
        
        parent_progress.status = "completed"
        parent_progress.progress = 100
        return success_count > 0
    
    def create_job(self, name: str, urls: List[str], format_type: str, custom_settings: dict = None) -> DownloadJob:
        """Create a new download job."""
        settings = {**self.settings, **(custom_settings or {})}
        job = DownloadJob(name, urls, format_type, settings)
        
        with self._lock:
            self.jobs[job.id] = job
        
        return job
    
    def start_job(self, job_id: str) -> bool:
        """Start executing a download job."""
        job = self.jobs.get(job_id)
        if not job:
            return False
        
        job.status = "running"
        job.started_at = datetime.now()
        
        # Create download progress objects for each URL
        for url in job.urls:
            progress = DownloadProgress(url)
            job.downloads.append(progress)
        
        self._emit_progress('job_started', job.to_dict())
        
        # Start downloads in thread pool
        max_threads = self.settings.get('max_threads', 4)
        
        def run_job():
            with ThreadPoolExecutor(max_workers=max_threads) as executor:
                futures = []
                for download in job.downloads:
                    future = executor.submit(
                        self._download_single, 
                        download.url, 
                        job.format_type, 
                        download
                    )
                    futures.append(future)
                
                # Wait for all downloads to complete
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        print(f"Download error: {e}")
            
            job.status = "completed"
            job.completed_at = datetime.now()
            self._emit_progress('job_completed', job.to_dict())
        
        # Run in background thread
        thread = threading.Thread(target=run_job)
        thread.daemon = True
        thread.start()
        
        return True
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a running job."""
        job = self.jobs.get(job_id)
        if job and job.status == "running":
            job.status = "cancelled"
            self._emit_progress('job_cancelled', job.to_dict())
            return True
        return False
    
    def get_job(self, job_id: str) -> Optional[dict]:
        """Get job details."""
        job = self.jobs.get(job_id)
        return job.to_dict() if job else None
    
    def get_all_jobs(self) -> List[dict]:
        """Get all jobs."""
        return [job.to_dict() for job in self.jobs.values()]
    
    def quick_download(self, url: str, format_type: str) -> DownloadProgress:
        """Quick single URL download without creating a job."""
        progress = DownloadProgress(url)
        
        def run_download():
            self._download_single(url, format_type, progress)
        
        thread = threading.Thread(target=run_download)
        thread.daemon = True
        thread.start()
        
        return progress
    
    def get_download_history(self) -> List[dict]:
        """Get download history."""
        return self.duplicate_detector.get_history()
    
    def clear_history(self):
        """Clear download history."""
        self.duplicate_detector.clear_history()