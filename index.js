const cp = require('child_process');
const express = require("express");
const app = express();
const readline = require('readline');
const ytdl = require('ytdl-core');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));

const VideoListItem = [];

app.get("/", (req, res) => {
  res.json({
    data:"http://YOUR_SERVER_NAME/?url=https://www.youtube.com/watch?v=o4yzuz8jWbI&pp=ygUMYm95IHdpdGh0dWtl&quality=720p",
    ForDownloadFile: "http://YOUR_SERVER_NAME/download?url=https://www.youtube.com/watch?v=o4yzuz8jWbI&quality=720p"
  });
});

app.get("/download", async (req, res) => {
  const url = req.query.url;
  const ref = url;
  const requestedQuality = req.query.quality; // Get quality from query

  async function videoFunction(url) {
    const getUrl = await ytdl.getInfo(ref).then(async (info) => {
      const GetDetails = await info.player_response.videoDetails;
      VideoListItem.push({
        videoDetails: {
          title: GetDetails.title,
          author: GetDetails.author,
          lengthSeconds: GetDetails.lengthSeconds,
          shortDescription: GetDetails.shortDescription,
          thumbnail: GetDetails.thumbnail.thumbnails,
          channelID: GetDetails.channelId
        }
      });
    }).catch((err) => {
      console.log(err);
    });
    return getUrl;
  }

  await videoFunction(ref);

  const tracker = {
    start: Date.now(),
    audio: { downloaded: 0, total: Infinity },
    video: { downloaded: 0, total: Infinity },
    merged: { frame: 0, speed: '0x', fps: 0 },
  };

  const audio = ytdl(ref, { quality: 'lowestaudio' })
    .on('progress', (_, downloaded, total) => {
      tracker.audio = { downloaded, total };
    });
  

  const video = ytdl(ref, {
    filter: format => format.qualityLabel === requestedQuality,
  }).on('progress', (_, downloaded, total) => {
    tracker.video = { downloaded, total };
  });

  let progressbarHandle = null;
  const progressbarInterval = 1000;
  const showProgress = () => {
    readline.cursorTo(process.stdout, 0);
    const toMB = i => (i / 1024 / 1024).toFixed(2);

    process.stdout.write(`Audio  | ${(tracker.audio.downloaded / tracker.audio.total * 100).toFixed(2)}% processed `);
    process.stdout.write(`(${toMB(tracker.audio.downloaded)}MB of ${toMB(tracker.audio.total)}MB).${' '.repeat(10)}\n`);

    process.stdout.write(`Video  | ${(tracker.video.downloaded / tracker.video.total * 100).toFixed(2)}% processed `);
    process.stdout.write(`(${toMB(tracker.video.downloaded)}MB of ${toMB(tracker.video.total)}MB).${' '.repeat(10)}\n`);

    process.stdout.write(`Merged | processing frame ${tracker.merged.frame} `);
    process.stdout.write(`(at ${tracker.merged.fps} fps => ${tracker.merged.speed}).${' '.repeat(10)}\n`);

    process.stdout.write(`running for: ${((Date.now() - tracker.start) / 1000 / 60).toFixed(2)} Minutes.`);
    readline.moveCursor(process.stdout, 0, -3);
  };

  const myary = [];
  const outputTitle = VideoListItem.length > 0 ? VideoListItem[0].videoDetails.title : 'defaultTitle';

  const outputFilePath = `./public/${Date.now()}.mkv`;

  const ffmpegProcess = cp.spawn(ffmpeg, [
    '-loglevel', '8', '-hide_banner',
    '-progress', 'pipe:3',
    '-i', 'pipe:4',
    '-i', 'pipe:5',
    '-map', '0:a',
    '-map', '1:v',
    '-c:v', 'copy',
    outputFilePath
  ], {
    windowsHide: true,
    stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe', 'pipe'],
  });

  const sanitizedTitle = outputTitle.replace(/[<>:"/\\|?*]+/g, ''); // Remove illegal characters
  const newFilePath = `./public/${sanitizedTitle +" - "+ requestedQuality}.mkv`;
  ffmpegProcess.on('close', () => {
    console.log('done');
    process.stdout.write('\n\n\n\n');
    clearInterval(progressbarHandle);

    fs.rename(outputFilePath, newFilePath, (err) => {
        if (err) {
            console.error('Error renaming file:', err);
        } else {
            console.log('File renamed to:', newFilePath);
            // Schedule deletion after 5 minutes (adjust time as needed)
            setTimeout(() => {
                fs.unlink(newFilePath, (err) => {
                    if (err) {
                        console.error('Error deleting file:', err);
                    } else {
                        console.log('File deleted:', newFilePath);
                    }
                });
            },  5 * 60 * 1000); // 5 minutes in milliseconds
        }
    });
});


  ffmpegProcess.stdio[3].on('data', chunk => {
    if (!progressbarHandle) progressbarHandle = setInterval(showProgress, progressbarInterval);
    const lines = chunk.toString().trim().split('\n');
    const args = {};
    for (const l of lines) {
      const [key, value] = l.split('=');
      args[key.trim()] = value.trim();
    }
    tracker.merged = args;
  });
  audio.pipe(ffmpegProcess.stdio[4]);
  video.pipe(ffmpegProcess.stdio[5]);

  res.json({
    video: `http://localhost:3000/${sanitizedTitle +" - "+ req.query.quality}.mkv`,
    VideoListItem: VideoListItem,
  });


});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server is running on port 3000");
});
