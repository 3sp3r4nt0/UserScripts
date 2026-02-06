# downloader/filters.py
import re
from typing import List, Optional, Tuple


class VideoFilter:
    """Filter videos based on various criteria."""
    
    DEFAULT_EXCLUDE_PATTERNS = [
        r'\binstrum(?:ental)?\b',
        r'\bkaraoke\b',
        r'\blyric(?:s)?\s*video\b',
        r'\bacoustic\s*cover\b',
    ]
    
    def __init__(self):
        self.exclude_patterns: List[re.Pattern] = []
        self.include_patterns: List[re.Pattern] = []
        self.min_duration: int = 0
        self.max_duration: int = 3600
        self._compile_default_patterns()
    
    def _compile_default_patterns(self):
        """Compile default exclusion patterns."""
        for pattern in self.DEFAULT_EXCLUDE_PATTERNS:
            self.exclude_patterns.append(re.compile(pattern, re.IGNORECASE))
    
    def set_exclude_keywords(self, keywords: List[str]):
        """Set custom exclusion keywords."""
        self.exclude_patterns = []
        for keyword in keywords:
            # Escape special regex characters and create word boundary pattern
            escaped = re.escape(keyword)
            pattern = re.compile(rf'\b{escaped}\b', re.IGNORECASE)
            self.exclude_patterns.append(pattern)
    
    def set_include_keywords(self, keywords: List[str]):
        """Set inclusion keywords (video must match at least one)."""
        self.include_patterns = []
        for keyword in keywords:
            escaped = re.escape(keyword)
            pattern = re.compile(rf'\b{escaped}\b', re.IGNORECASE)
            self.include_patterns.append(pattern)
    
    def set_duration_limits(self, min_seconds: int = 0, max_seconds: int = 3600):
        """Set duration limits."""
        self.min_duration = min_seconds
        self.max_duration = max_seconds
    
    def check_title(self, title: str) -> Tuple[bool, Optional[str]]:
        """
        Check if title passes filters.
        Returns (passed, reason) tuple.
        """
        if not title:
            return True, None
        
        # Check exclusion patterns
        for pattern in self.exclude_patterns:
            if pattern.search(title):
                return False, f"Title matches exclusion pattern: {pattern.pattern}"
        
        # Check inclusion patterns (if any set, must match at least one)
        if self.include_patterns:
            matched = any(pattern.search(title) for pattern in self.include_patterns)
            if not matched:
                return False, "Title does not match any inclusion pattern"
        
        return True, None
    
    def check_duration(self, duration: int) -> Tuple[bool, Optional[str]]:
        """
        Check if duration is within limits.
        Returns (passed, reason) tuple.
        """
        if duration is None:
            return True, None
        
        if duration < self.min_duration:
            return False, f"Duration ({duration}s) below minimum ({self.min_duration}s)"
        
        if duration > self.max_duration:
            return False, f"Duration ({duration}s) exceeds maximum ({self.max_duration}s)"
        
        return True, None
    
    def check_video(self, info: dict) -> Tuple[bool, Optional[str]]:
        """
        Check if video passes all filters.
        Returns (passed, reason) tuple.
        """
        title = info.get('title', '')
        duration = info.get('duration', 0)
        
        # Check title
        passed, reason = self.check_title(title)
        if not passed:
            return False, reason
        
        # Check duration
        passed, reason = self.check_duration(duration)
        if not passed:
            return False, reason
        
        return True, None
    
    def filter_list(self, videos: List[dict]) -> Tuple[List[dict], List[dict]]:
        """
        Filter a list of videos.
        Returns (passed_videos, filtered_videos) tuple.
        """
        passed = []
        filtered = []
        
        for video in videos:
            check_passed, reason = self.check_video(video)
            if check_passed:
                passed.append(video)
            else:
                video['filter_reason'] = reason
                filtered.append(video)
        
        return passed, filtered


def format_duration(seconds: int) -> str:
    """Format seconds to human readable duration."""
    if seconds is None:
        return "Unknown"
    
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def parse_duration_string(duration_str: str) -> int:
    """Parse duration string (HH:MM:SS or MM:SS) to seconds."""
    parts = duration_str.strip().split(':')
    
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1:
            return int(parts[0])
    except ValueError:
        pass
    
    return 0