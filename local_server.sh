#!/bin/bash
export JEKYLL_VERSION=4.2.0

docker run --rm -it -e JEKYLL_UID=`id -u` -v./:/srv/jekyll -p 4000:4000 jekyll/jekyll:$JEKYLL_VERSION jekyll serve --livereload
