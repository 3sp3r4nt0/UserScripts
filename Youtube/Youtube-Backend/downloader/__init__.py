# downloader/__init__.py
from .core import DownloadManager, DownloadProgress, DownloadJob
from .filters import VideoFilter
from .duplicate_detector import DuplicateDetector
from .metadata_handler import MetadataHandler

__all__ = [
    'DownloadManager', 
    'DownloadProgress', 
    'DownloadJob',
    'VideoFilter', 
    'DuplicateDetector', 
    'MetadataHandler'
]