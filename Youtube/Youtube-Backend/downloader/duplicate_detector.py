# downloader/duplicate_detector.py
import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Optional
import os


class DuplicateDetector:
    """Detect duplicate downloads using URL, title, and file hash comparisons."""
    
    def __init__(self, history_file: Path):
        self.history_file = history_file
        self.history: List[dict] = self._load_history()
    
    def _load_history(self) -> List[dict]:
        """Load download history from file."""
        if self.history_file.exists():
            try:
                with open(self.history_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        return []
    
    def _save_history(self):
        """Save download history to file."""
        self.history_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.history_file, 'w') as f:
            json.dump(self.history, f, indent=2, default=str)
    
    def _normalize_url(self, url: str) -> str:
        """Normalize URL for comparison."""
        # Remove common tracking parameters and normalize
        url = url.lower().strip()
        
        # Remove common query parameters that don't affect the video
        import urllib.parse
        parsed = urllib.parse.urlparse(url)
        
        # For YouTube, extract video ID
        if 'youtube.com' in parsed.netloc or 'youtu.be' in parsed.netloc:
            if 'v=' in url:
                video_id = url.split('v=')[1].split('&')[0]
                return f"youtube:{video_id}"
            elif 'youtu.be/' in url:
                video_id = url.split('youtu.be/')[1].split('?')[0]
                return f"youtube:{video_id}"
        
        return url
    
    def _normalize_title(self, title: str) -> str:
        """Normalize title for comparison."""
        import re
        # Remove special characters and extra spaces
        title = re.sub(r'[^\w\s]', '', title.lower())
        title = re.sub(r'\s+', ' ', title).strip()
        return title
    
    def _calculate_file_hash(self, file_path: str, chunk_size: int = 8192) -> Optional[str]:
        """Calculate MD5 hash of file."""
        if not os.path.exists(file_path):
            return None
        
        hash_md5 = hashlib.md5()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(chunk_size), b''):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except IOError:
            return None
    
    def is_duplicate(self, url: str, title: str = None, file_path: str = None) -> bool:
        """
        Check if a URL/title/file has already been downloaded.
        """
        normalized_url = self._normalize_url(url)
        normalized_title = self._normalize_title(title) if title else None
        
        for entry in self.history:
            # Check URL match
            if self._normalize_url(entry.get('url', '')) == normalized_url:
                return True
            
            # Check title match (fuzzy)
            if normalized_title and entry.get('title'):
                if self._normalize_title(entry['title']) == normalized_title:
                    return True
        
        # Check file hash if provided
        if file_path:
            file_hash = self._calculate_file_hash(file_path)
            if file_hash:
                for entry in self.history:
                    if entry.get('file_hash') == file_hash:
                        return True
        
        return False
    
    def add_to_history(self, url: str, title: str, file_path: str = None):
        """Add a download to history."""
        file_hash = self._calculate_file_hash(file_path) if file_path else None
        
        entry = {
            'url': url,
            'normalized_url': self._normalize_url(url),
            'title': title,
            'file_path': file_path,
            'file_hash': file_hash,
            'downloaded_at': datetime.now().isoformat(),
        }
        
        self.history.append(entry)
        self._save_history()
    
    def get_history(self) -> List[dict]:
        """Get download history."""
        return self.history.copy()
    
    def clear_history(self):
        """Clear download history."""
        self.history = []
        self._save_history()
    
    def remove_from_history(self, url: str) -> bool:
        """Remove a specific URL from history."""
        normalized_url = self._normalize_url(url)
        original_length = len(self.history)
        
        self.history = [
            entry for entry in self.history 
            if self._normalize_url(entry.get('url', '')) != normalized_url
        ]
        
        if len(self.history) < original_length:
            self._save_history()
            return True
        return False
    
    def scan_existing_files(self, directories: List[Path]) -> int:
        """Scan directories and add existing files to history."""
        added_count = 0
        
        for directory in directories:
            if not directory.exists():
                continue
            
            for file_path in directory.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in ['.mp3', '.mp4', '.webm', '.m4a']:
                    file_hash = self._calculate_file_hash(str(file_path))
                    
                    # Check if already in history
                    if not any(entry.get('file_hash') == file_hash for entry in self.history if file_hash):
                        entry = {
                            'url': '',
                            'normalized_url': '',
                            'title': file_path.stem,
                            'file_path': str(file_path),
                            'file_hash': file_hash,
                            'downloaded_at': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                            'source': 'scan',
                        }
                        self.history.append(entry)
                        added_count += 1
        
        if added_count > 0:
            self._save_history()
        
        return added_count