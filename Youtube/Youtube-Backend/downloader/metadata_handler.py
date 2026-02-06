# downloader/metadata_handler.py
import os
import json
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

try:
    from mutagen.mp3 import MP3
    from mutagen.id3 import ID3, TIT2, TPE1, TALB, TDRC, COMM, APIC
    from mutagen.mp4 import MP4
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False

try:
    from PIL import Image
    import requests
    from io import BytesIO
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


class MetadataHandler:
    """Handle metadata extraction and embedding for downloaded files."""
    
    def __init__(self):
        self.mutagen_available = MUTAGEN_AVAILABLE
        self.pil_available = PIL_AVAILABLE
    
    def extract_from_info(self, info: dict) -> Dict[str, Any]:
        """Extract relevant metadata from yt-dlp info dict."""
        return {
            'title': info.get('title', ''),
            'artist': info.get('artist') or info.get('uploader') or info.get('channel', ''),
            'album': info.get('album', ''),
            'description': info.get('description', ''),
            'upload_date': info.get('upload_date', ''),
            'duration': info.get('duration', 0),
            'view_count': info.get('view_count', 0),
            'like_count': info.get('like_count', 0),
            'thumbnail': info.get('thumbnail', ''),
            'webpage_url': info.get('webpage_url', ''),
            'extractor': info.get('extractor', ''),
            'categories': info.get('categories', []),
            'tags': info.get('tags', []),
        }
    
    def embed_metadata_mp3(self, file_path: str, metadata: dict, thumbnail_path: str = None) -> bool:
        """Embed metadata into MP3 file."""
        if not self.mutagen_available:
            return False
        
        try:
            audio = MP3(file_path, ID3=ID3)
            
            # Add ID3 tag if not present
            try:
                audio.add_tags()
            except Exception:
                pass
            
            # Set metadata
            if metadata.get('title'):
                audio.tags.add(TIT2(encoding=3, text=metadata['title']))
            
            if metadata.get('artist'):
                audio.tags.add(TPE1(encoding=3, text=metadata['artist']))
            
            if metadata.get('album'):
                audio.tags.add(TALB(encoding=3, text=metadata['album']))
            
            if metadata.get('upload_date'):
                try:
                    year = metadata['upload_date'][:4]
                    audio.tags.add(TDRC(encoding=3, text=year))
                except Exception:
                    pass
            
            if metadata.get('description'):
                audio.tags.add(COMM(encoding=3, lang='eng', desc='Description', 
                                   text=metadata['description'][:500]))
            
            # Embed thumbnail
            if thumbnail_path and os.path.exists(thumbnail_path):
                with open(thumbnail_path, 'rb') as img_file:
                    audio.tags.add(APIC(
                        encoding=3,
                        mime='image/jpeg',
                        type=3,  # Cover (front)
                        desc='Cover',
                        data=img_file.read()
                    ))
            elif metadata.get('thumbnail') and self.pil_available:
                try:
                    response = requests.get(metadata['thumbnail'], timeout=10)
                    if response.status_code == 200:
                        img = Image.open(BytesIO(response.content))
                        img = img.convert('RGB')
                        img_buffer = BytesIO()
                        img.save(img_buffer, format='JPEG', quality=85)
                        
                        audio.tags.add(APIC(
                            encoding=3,
                            mime='image/jpeg',
                            type=3,
                            desc='Cover',
                            data=img_buffer.getvalue()
                        ))
                except Exception:
                    pass
            
            audio.save()
            return True
            
        except Exception as e:
            print(f"Error embedding MP3 metadata: {e}")
            return False
    
    def embed_metadata_mp4(self, file_path: str, metadata: dict) -> bool:
        """Embed metadata into MP4 file."""
        if not self.mutagen_available:
            return False
        
        try:
            video = MP4(file_path)
            
            if metadata.get('title'):
                video['\xa9nam'] = [metadata['title']]
            
            if metadata.get('artist'):
                video['\xa9ART'] = [metadata['artist']]
            
            if metadata.get('album'):
                video['\xa9alb'] = [metadata['album']]
            
            if metadata.get('upload_date'):
                try:
                    video['\xa9day'] = [metadata['upload_date'][:4]]
                except Exception:
                    pass
            
            if metadata.get('description'):
                video['desc'] = [metadata['description'][:500]]
            
            video.save()
            return True
            
        except Exception as e:
            print(f"Error embedding MP4 metadata: {e}")
            return False
    
    def read_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Read metadata from a media file."""
        if not self.mutagen_available:
            return None
        
        ext = Path(file_path).suffix.lower()
        
        try:
            if ext == '.mp3':
                audio = MP3(file_path, ID3=ID3)
                return {
                    'title': str(audio.tags.get('TIT2', '')),
                    'artist': str(audio.tags.get('TPE1', '')),
                    'album': str(audio.tags.get('TALB', '')),
                    'duration': audio.info.length,
                }
            elif ext in ['.mp4', '.m4a']:
                video = MP4(file_path)
                return {
                    'title': video.get('\xa9nam', [''])[0],
                    'artist': video.get('\xa9ART', [''])[0],
                    'album': video.get('\xa9alb', [''])[0],
                    'duration': video.info.length,
                }
        except Exception as e:
            print(f"Error reading metadata: {e}")
        
        return None
    
    def save_info_json(self, file_path: str, info: dict):
        """Save full info dict to JSON file alongside the media file."""
        json_path = Path(file_path).with_suffix('.info.json')
        
        # Filter out non-serializable items
        clean_info = {}
        for key, value in info.items():
            try:
                json.dumps(value)
                clean_info[key] = value
            except (TypeError, ValueError):
                continue
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(clean_info, f, indent=2, ensure_ascii=False)
    
    def load_info_json(self, file_path: str) -> Optional[dict]:
        """Load info JSON file for a media file."""
        json_path = Path(file_path).with_suffix('.info.json')
        
        if json_path.exists():
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        
        return None