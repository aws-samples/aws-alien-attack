#!/bin/bash
##
# Deploys the front-end
##

txtgrn=$(tput setaf 2) # Green
txtylw=$(tput setaf 3) # Yellow
txtblu=$(tput setaf 4) # Blue
txtpur=$(tput setaf 5) # Purple
txtcyn=$(tput setaf 6) # Cyan
txtwht=$(tput setaf 7) # White
txtrst=$(tput sgr0) # Text reset

_DEBUG="on"

function EXECUTE() {
    [ "$_DEBUG" == "on" ] && echo $@ || $@
}

function title() {
    tput rev 
    showHeader $@
    tput sgr0
}

function showHeader() {
    input=$@
    echo ${txtgrn}
    printf "%0.s-" $(seq 1 ${#input})
    printf "\n"
    echo $input
    printf "%0.s-" $(seq 1 ${#input})
    echo ${txtrst}  
}

function showSectionTitle() {
    echo 
    echo ---  ${txtblu} $@ ${txtrst}  
    echo 
}

envnameuppercase=$(echo $envname | tr 'a-z' 'A-Z')
envnamelowercase=$(echo $envname | tr 'A-Z' 'a-z')
#-------------------------------------------
# Introduction
#-------------------------------------------
title "DEPLOYING THE FRONT-END FOR THE ENVIRONMENT $envnameuppercase"
## Fixing Cognito is required only for the workshop
#showHeader Fixing Cognito
#source fixcognito.sh
#-------------------------------------------
# Retrieving parameters from CloudFormation
#-------------------------------------------
apigtw=$(eval $(echo "aws cloudformation list-exports --query 'Exports[?contains(ExportingStackId,\`$envname\`) && contains(Name,\`apigtw\`)].Value | [0]' | xargs -I {} echo {}"))
region=$(eval $(echo "aws cloudformation list-exports --query 'Exports[?contains(ExportingStackId,\`$envname\`) && contains(Name,\`region\`)].Value | [0]' | xargs -I {} echo {}"))
url=$(eval $(echo "aws cloudformation list-exports --query 'Exports[?contains(ExportingStackId,\`$envname\`) && contains(Name,\`url\`)].Value | [0]' | xargs -I {} echo {}"))
#-------------------------------------------
# UPDATING /application/resources/js/awsconfig.js
#-------------------------------------------
showHeader "UPDATING /application/resources/js/awsconfig.js"
cat <<END > ./../application/resources/js/awsconfig.js
const DEBUG = true;
const AWS_CONFIG = {
    "region" : "$region",
    "API_ENDPOINT" : "$apigtw",
    "APPNAME" : "$envnameuppercase"
};
END
more ./../application/resources/js/awsconfig.js
#-------------------------------------------
# DEPLOYING THE WEBSITE ON S3
#-------------------------------------------
showHeader "DEPLOYING THE WEBSITE ON S3"
aws s3 cp ./../application s3://$envnamelowercase.app --recursive
#-------------------------------------------
# Finalization
#-------------------------------------------
title "Environment $envnameuppercase deployed"
if [ "$url" == "" ]; then
   echo "You DON'T have a CloudFront distribution deployed. Please deploy it."
else
   echo "URL: https://$url"
fi