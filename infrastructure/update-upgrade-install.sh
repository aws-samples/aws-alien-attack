#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
echo Updating the attached instance
# We need first to check what's the underlying operating system
OSNAME=$(uname -a)
if [[ "$OSNAME" == *"Ubuntu"* ]]; then
   OSNAME="UBUNTU"
elif [[ "$OSNAME" == *"amzn2"* ]]; then
   OSNAME="AMAZON"
elif [[ "$OSNAME" == *"Darwin"* ]]; then
   OSNAME="OSX"
else 
   OSNAME="INVALID"
fi

## NodeJS version
node_version=""
## Typescript version
tsc_version=""
## CDK version
cdk_version=""

UPDATE_TYPE="AUTOMATIC"
case $OSNAME in
   AMAZON)
        sudo yum update -y
        node_version="v20.5.1"
        tsc_version="5.1.6"
        cdk_version="2.150.0" 
        ;;
   UBUNTU)
        sudo apt-get update -y
        node_version="v18.17.1"
        tsc_version="5.0.3"
        cdk_version="2.101.1" 
        ;;
   OSX)
        echo "This is Mac OSX"
        echo "You need to update it by hand"
        UPDATE_TYPE="BY_HAND" 
        ;;
    *)
        echo "Invalid OS"
        echo "You need to update it by hand"
        UPDATE_TYPE="BY_HAND";;
esac
if [[ "$UPDATE_TYPE" == "BY_HAND" ]]; then
   echo "Follow the instructions to install CDK version >= 2.72.0 <= 2.91.0"
   exit 0
fi
echo --
echo Configuring your $OSNAME
echo --
### Check if nvm is installed
if ! command -v nvm &> /dev/null; then
    echo "nvm is not installed. Installing nvm..."
    # Download nvm installation script
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
    echo "nvm has been installed."
else
    echo "nvm is already installed."
fi
###
echo Configuring nodejs
#node_version=$(nvm ls-remote --lts | grep Latest | tail -1 | grep -o 'v[.0-9]*' | sed 's/\x1b\[[0-9;]*m//g')
#node_version=${node_version:1}
if [[ $(nvm ls | grep $node_version) == "" ]]; then
  nvm install $node_version
  nvm use $node_version
  nvm alias latest $node_version
  nvm alias default latest
else
  nvm use $node_version
  nvm alias latest $node_version
  nvm alias default latest
fi

echo --
echo Installing Typescript
if [[ $( npm list -g typescript | grep $tsc_version ) == "" ]]; then
  npm install -g typescript@$tsc_version
fi
echo --
echo Installing CDK
# Forcing the removal of the latest version
rm -rf ~/.nvm/versions/node/$node_version/bin/cdk
#installing it
npm install -g aws-cdk@$cdk_version
echo --
echo Bootstraping CDK
account=$(aws sts get-caller-identity --output text --query 'Account')
region=$(aws configure get region)
cdk bootstrap aws://$account/$region
echo --
echo Installing CDK dependencies
cd cdk
npm install
echo --
# THIS IS FOR FUTURE CONFIGURATION OF AWS SDK v2
#echo Installing Lambda dependencies
#find ./lambdas -name 'package.json' -not -path '*/node_modules*' -execdir npm install \;
[[ $(grep "nvm use latest" ~/.bash_profile) ]] || echo nvm use latest >> ~/.bash_profile
