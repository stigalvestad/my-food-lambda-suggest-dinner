#!/usr/bin/env bash

npm install
rm -r ./tmp
rm -r ./dist
mkdir tmp
mkdir dist
cp -R node_modules/ tmp/
cp index.js tmp/
cp package.json tmp/
cd tmp/
zip -r ../dist/my-food-lambda-suggest-dinner.zip .
echo 'Completed'