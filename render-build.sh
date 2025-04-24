#!/bin/bash

echo "==> Forcing npm install of devDependencies"
npm install

echo "==> Building project manually"
npm run build
