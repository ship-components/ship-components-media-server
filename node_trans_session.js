//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
  }

  /**
   * Smartly tries to resovle the directory where
   * the video should be stored
   */
  getDirectory() {
    if (typeof this.conf.directory === 'function') {
      return this.conf.directory(this.conf);
    } else if (typeof this.conf.directory === 'string') {
      return `${this.conf.directory}/${this.conf.stream}`;
    } else {
      return `${this.conf.mediaroot}/${this.conf.app}/${this.conf.stream}`;
    }
  }

  run() {
    let vc = 'copy';
    let ac = this.conf.args.ac == 10 ? 'copy' : this.conf.ac ? this.conf.ac : 'aac';
    let inPath = 'rtmp://127.0.0.1:' + this.conf.port + this.conf.streamPath;
    let ouPath = this.getDirectory();
    let mapStr = '';
    if (this.conf.mp4) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let now = new Date();
      let mp4FileName = this.conf.stream + '.mp4';
      let mapMp4 = `${this.conf.mp4Flags}${ouPath}/${mp4FileName}|`;
      mapStr += mapMp4;
      Logger.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + ouPath + '/' + mp4FileName);
    }
    if (this.conf.hls) {
      this.conf.hlsFlags = this.conf.hlsFlags ? this.conf.hlsFlags : '';
      let hlsFileName = 'index.m3u8';
      let mapHls = `${this.conf.hlsFlags}${ouPath}/${hlsFileName}|`;
      mapStr += mapHls;
      Logger.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + ouPath + '/' + hlsFileName);
    }
    if (this.conf.dash) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFileName = 'index.mpd';
      let mapDash = `${this.conf.dashFlags}${ouPath}/${dashFileName}`;
      mapStr += mapDash;
      Logger.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + ouPath + '/' + dashFileName);
    }
    mkdirp.sync(ouPath);
    let argv = [
      '-loglevel',
      'error',
      '-nostdin',
      '-hide_banner',
      '-nostats',
      '-y',
      '-fflags',
      'nobuffer',
      '-analyzeduration',
      '1000000',
      '-i',
      inPath,
      '-timeout',
      '10',
      '-c:v',
      vc,
      '-c:a',
      ac,
      '-preset',
      this.conf.preset || 'veryfast',
      '-f',
      'tee',
      '-map',
      '0:a?',
      '-map',
      '0:v?',
      mapStr
    ];
    Logger.info('[ffmpeg] %s %s', this.conf.ffmpeg, argv.join(' '));

    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.error(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.info(`[ffmpeg] ${data.toString().trim()}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.error(`[ffmpeg] ${data.toString().trim()}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      this.emit('end');
      if (this.conf.removeOnExit) {
        fs.readdir(ouPath, function (err, files) {
          if (!err) {
            files.forEach((filename) => {
              if (filename.endsWith('.ts')
                || filename.endsWith('.m3u8')
                || filename.endsWith('.mpd')
                || filename.endsWith('.m4s')) {
                fs.unlinkSync(ouPath + '/' + filename);
              }
            })
          }
        });
      }
    });
  }

  end() {
    this.ffmpeg_exec.kill('SIGTERM');
  }
}

module.exports = NodeTransSession;
