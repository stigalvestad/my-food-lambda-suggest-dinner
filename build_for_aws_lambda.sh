#!/usr/bin/env bash

rm -r ./tmp
rm -r ./dist
mkdir tmp
mkdir dist
cp -R node_modules/ tmp/
cp index.js tmp/
zip -r dist/my-food-lambda-suggest-dinner.zip tmp/
echo 'Completed'