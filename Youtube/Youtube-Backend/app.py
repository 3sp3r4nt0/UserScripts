# app.py
import os
import json
from flask import Flask, render_template, request, redirect, url_for, jsonify, flash
from flask_socketio import SocketIO, emit
from config import Config
from downloader import DownloadManager

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)
app.secret_key = Config.SECRET_KEY

# Initialize SocketIO for real-time updates
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Initialize configuration
Config.init_directories()

# Initialize download manager with socketio
download_manager = DownloadManager(Config, socketio)


# ============== ROUTES ==============

@app.route('/')
def index():
    """Homepage with download form."""
    settings = download_manager.get_settings()
    recent_downloads = download_manager.get_download_history()[-10:]  # Last 10
    return render_template('index.html', settings=settings, recent_downloads=recent_downloads)


@app.route('/download', methods=['POST'])
def download():
    """Handle single URL download request."""
    url = request.form.get('url', '').strip()
    format_type = request.form.get('format', 'mp4')
    
    if not url:
        flash('Please enter a valid URL', 'error')
        return redirect(url_for('index'))
    
    try:
        progress = download_manager.quick_download(url, format_type)
        flash(f'Download started: {url}', 'success')
        return jsonify({
            'status': 'started',
            'download_id': progress.id,
            'message': 'Download started successfully'
        })
    except Exception as e:
        flash(f'Error starting download: {str(e)}', 'error')
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/download/batch', methods=['POST'])
def batch_download():
    """Handle batch URL downloads."""
    data = request.get_json() or request.form
    
    urls = data.get('urls', [])
    if isinstance(urls, str):
        urls = [u.strip() for u in urls.split('\n') if u.strip()]
    
    format_type = data.get('format', 'mp4')
    job_name = data.get('name', 'Batch Download')
    
    if not urls:
        return jsonify({'status': 'error', 'message': 'No URLs provided'}), 400
    
    try:
        job = download_manager.create_job(job_name, urls, format_type)
        download_manager.start_job(job.id)
        
        return jsonify({
            'status': 'started',
            'job_id': job.id,
            'message': f'Started batch download of {len(urls)} items'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/jobs')
def jobs():
    """View all download jobs."""
    all_jobs = download_manager.get_all_jobs()
    return render_template('jobs.html', jobs=all_jobs)


@app.route('/jobs/<job_id>')
def job_detail(job_id):
    """View specific job details."""
    job = download_manager.get_job(job_id)
    if not job:
        flash('Job not found', 'error')
        return redirect(url_for('jobs'))
    return jsonify(job)


@app.route('/jobs/<job_id>/cancel', methods=['POST'])
def cancel_job(job_id):
    """Cancel a running job."""
    if download_manager.cancel_job(job_id):
        return jsonify({'status': 'cancelled', 'message': 'Job cancelled successfully'})
    return jsonify({'status': 'error', 'message': 'Could not cancel job'}), 400


@app.route('/search')
def search_page():
    """Search page for finding videos."""
    return render_template('search.html', supported_sites=Config.SUPPORTED_SITES)


@app.route('/search/query', methods=['POST'])
def search_query():
    """Execute search query."""
    data = request.get_json()
    query = data.get('query', '')
    site = data.get('site', 'youtube')
    max_results = int(data.get('max_results', 20))
    
    if not query:
        return jsonify({'status': 'error', 'message': 'No search query provided'}), 400
    
    try:
        results = download_manager.search_videos(query, site, max_results)
        return jsonify({
            'status': 'success',
            'results': results,
            'count': len(results)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/extract', methods=['POST'])
def extract_info():
    """Extract video information without downloading."""
    data = request.get_json()
    url = data.get('url', '')
    
    if not url:
        return jsonify({'status': 'error', 'message': 'No URL provided'}), 400
    
    try:
        info = download_manager.extract_info(url)
        if info and 'error' not in info:
            return jsonify({
                'status': 'success',
                'info': {
                    'title': info.get('title', 'Unknown'),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'uploader': info.get('uploader', 'Unknown'),
                    'description': info.get('description', '')[:500],
                    'view_count': info.get('view_count', 0),
                    'upload_date': info.get('upload_date', ''),
                    'is_playlist': 'entries' in info,
                    'playlist_count': len(info.get('entries', [])) if 'entries' in info else 0,
                }
            })
        return jsonify({'status': 'error', 'message': info.get('error', 'Unknown error')}), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/settings', methods=['GET', 'POST'])
def settings():
    """Settings page."""
    if request.method == 'POST':
        data = request.form.to_dict()
        
        # Parse and validate settings
        new_settings = {
            'max_video_length': int(data.get('max_video_length', 3600)),
            'min_video_length': int(data.get('min_video_length', 0)),
            'max_threads': int(data.get('max_threads', 4)),
            'default_format': data.get('default_format', 'mp4'),
            'video_quality': data.get('video_quality', 'best'),
            'audio_quality': data.get('audio_quality', '192'),
            'extract_metadata': data.get('extract_metadata') == 'on',
            'embed_thumbnail': data.get('embed_thumbnail') == 'on',
            'download_subtitles': data.get('download_subtitles') == 'on',
            'preferred_subtitle_lang': data.get('preferred_subtitle_lang', 'en'),
        }
        
        # Parse exclude keywords
        keywords = data.get('exclude_keywords', '')
        new_settings['exclude_keywords'] = [k.strip() for k in keywords.split(',') if k.strip()]
        
        download_manager.save_settings(new_settings)
        flash('Settings saved successfully', 'success')
        return redirect(url_for('settings'))
    
    current_settings = download_manager.get_settings()
    return render_template('settings.html', settings=current_settings)


@app.route('/history')
def history():
    """View download history."""
    download_history = download_manager.get_download_history()
    return render_template('status.html', history=download_history)


@app.route('/history/clear', methods=['POST'])
def clear_history():
    """Clear download history."""
    download_manager.clear_history()
    flash('Download history cleared', 'success')
    return redirect(url_for('history'))


@app.route('/status')
def status():
    """Get current status of all active downloads."""
    jobs = download_manager.get_all_jobs()
    active_jobs = [j for j in jobs if j['status'] == 'running']
    return jsonify({
        'active_jobs': len(active_jobs),
        'jobs': jobs
    })


# ============== SOCKET.IO EVENTS ==============

@socketio.on('connect')
def handle_connect():
    """Handle client connection."""
    emit('connected', {'message': 'Connected to download server'})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection."""
    print('Client disconnected')


@socketio.on('start_download')
def handle_start_download(data):
    """Handle download request via WebSocket."""
    url = data.get('url', '')
    format_type = data.get('format', 'mp4')
    
    if url:
        progress = download_manager.quick_download(url, format_type)
        emit('download_started', progress.to_dict())


# ============== ERROR HANDLERS ==============

@app.errorhandler(404)
def not_found(e):
    return render_template('base.html', error='Page not found'), 404


@app.errorhandler(500)
def server_error(e):
    return render_template('base.html', error='Internal server error'), 500


# ============== MAIN ==============

if __name__ == '__main__':
    print("=" * 50)
    print("YouTube Downloader Server")
    print("=" * 50)
    print(f"MP3 Folder: {Config.DOWNLOAD_FOLDER_MP3}")
    print(f"MP4 Folder: {Config.DOWNLOAD_FOLDER_MP4}")
    print("=" * 50)
    
    socketio.run(app, debug=Config.DEBUG, host='0.0.0.0', port=5000)