#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
echo Updating the attached instance
sudo yum update -y
echo --
echo Configuring nodejs
#node_version=$(nvm ls-remote --lts | grep Latest | tail -1 | grep -o 'v[.0-9]*' | sed 's/\x1b\[[0-9;]*m//g')
#node_version=${node_version:1}
node_version="16.20.0"
if [[ $(nvm ls | grep $node_version) == "" ]]; then
  nvm install $node_version
else
  nvm use $node_version
  nvm alias latest $node_version
  nvm alias default latest
fi
nvm use $node_version
echo --
tsc_version="5.0.3"
echo Installing Typescript
if [[ $( npm list -g typescript | grep $tsc_version ) == "" ]]; then
  npm install -g typescript@$tsc_version
fi
echo --
cdk_version="2.72.0"
echo Installing CDK
# Forcing the removal of the latest version
rm -rf ~/.nvm/versions/node/v$node_version/bin/cdk
#installing it
npm install -g aws-cdk@$cdk_version
echo --
echo Bootstraping CDK
account=$(aws sts get-caller-identity --output text --query 'Account')
region=$(aws configure get region)
cdk bootstrap $account/$region
echo --
echo Installing CDK dependencies
cd cdk
npm install
echo --
# THIS IS FOR FUTURE CONFIGURATION OF AWS SDK v2
#echo Installing Lambda dependencies
#find ./lambdas -name 'package.json' -not -path '*/node_modules*' -execdir npm install \;
[[ $(grep "nvm use latest" ~/.bash_profile) ]] || echo nvm use latest >> ~/.bash_profile
