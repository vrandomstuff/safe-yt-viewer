#!/bin/zsh

yt-dlp \
  --flat-playlist \
  --extractor-args 'youtubetab:approximate_date' \
  --dump-single-json \
  --no-warnings \
  "https://www.youtube.com/playlist?list=UUx-PpwbajI5ToAY0WwJO2Kg" | tee UCx-PpwbajI5ToAY0WwJO2Kg.json
jq . UCx-PpwbajI5ToAY0WwJO2Kg.json > UCx-PpwbajI5ToAY0WwJO2Kg.formatted.json
