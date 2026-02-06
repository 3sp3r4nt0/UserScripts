# config.py
import os
from pathlib import Path

class Config:
    """Application configuration settings."""
    
    # Base directories
    BASE_DIR = Path(__file__).parent.absolute()
    DOWNLOAD_BASE_DIR = BASE_DIR / "downloads"
    DATA_DIR = BASE_DIR / "data"
    BIN_DIR = BASE_DIR / "bin"
    
    # FFmpeg location
    FFMPEG_LOCATION = BIN_DIR
    
    # Download folders
    DOWNLOAD_FOLDER_MP3 = DOWNLOAD_BASE_DIR / "mp3"
    DOWNLOAD_FOLDER_MP4 = DOWNLOAD_BASE_DIR / "mp4"
    
    # Default settings
    DEFAULT_SETTINGS = {
        "max_video_length": 3600,  # 1 hour in seconds
        "min_video_length": 0,
        "max_threads": 4,
        "default_format": "mp4",
        "video_quality": "best",
        "audio_quality": "192",
        "exclude_keywords": ["Instrum", "Instrumental", "Karaoke"],
        "extract_metadata": True,
        "embed_thumbnail": True,
        "download_subtitles": False,
        "preferred_subtitle_lang": "en",
    }
    
    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
    DEBUG = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    
    # File settings
    SETTINGS_FILE = DATA_DIR / "settings.json"
    HISTORY_FILE = DATA_DIR / "download_history.json"
    
    # Supported sites (partial list - yt-dlp supports 1000+)
    SUPPORTED_SITES = [
        "YouTube", "Vimeo", "Dailymotion", "SoundCloud", 
        "Bandcamp", "Twitter", "Facebook", "Instagram",
        "TikTok", "Twitch", "Reddit"
    ]
    
    @classmethod
    def init_directories(cls):
        """Create necessary directories if they don't exist."""
        cls.DOWNLOAD_FOLDER_MP3.mkdir(parents=True, exist_ok=True)
        cls.DOWNLOAD_FOLDER_MP4.mkdir(parents=True, exist_ok=True)
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.BIN_DIR.mkdir(parents=True, exist_ok=True)
    
    @classmethod
    def get_ffmpeg_path(cls):
        """Get the path to ffmpeg executable."""
        if os.name == 'nt':  # Windows
            ffmpeg_exe = cls.BIN_DIR / "ffmpeg.exe"
        else:  # Linux/Mac
            ffmpeg_exe = cls.BIN_DIR / "ffmpeg"
        
        if ffmpeg_exe.exists():
            return str(cls.BIN_DIR)
        return None