#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
##
# Destroys all the elements created on the environment
##

txtgrn=$(tput setaf 2) # Green
txtylw=$(tput setaf 3) # Yellow
txtblu=$(tput setaf 4) # Blue
txtpur=$(tput setaf 5) # Purple
txtcyn=$(tput setaf 6) # Cyan
txtwht=$(tput setaf 7) # White
txtrst=$(tput sgr0) # Text reset

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

_DEBUG="dryrun"

[ "$_DEBUG"=="dryrun" ] && title "EXECUTING DRY RUN"
function EXECUTE() {
  case "$_DEBUG" in 
  "on")
      echo $@
      $@
      ;;
  "dryrun")
      echo $@
      ;;
  *)
      $@
      ;;
  esac
}


function destroySSMParameters() {
    showHeader "DESTROYING SSM PARAMETERS NOT HANDLED BY CDK"
    envNameLowercase=$1
    getSessionParameterName=$(echo "aws ssm describe-parameters --query 'Parameters[?starts_with(@.Name,\`/"$envnameLowercase"\`)] | [?contains(@.Name, \`session\`)].Name | [0]' | sed -e 's/^\"//' -e 's/\"$//'")
    sessionParameterName=$(eval $getSessionParameterName)
    getWebsocketParameterName=$(echo "aws ssm describe-parameters --query 'Parameters[?starts_with(@.Name,\`/"$envnameLowercase"\`)] | [?contains(@.Name, \`websocket\`)].Name | [0]' | sed -e 's/^\"//' -e 's/\"$//'")
    websocketParameterName=$(eval $getWebsocketParameterName)
    if [ "$sessionParameterName" == "null" ]; then
       echo session Parameter not found for environment $envnameLowercase
    else
       echo Deleting session parameter $sessionParameterName
       EXECUTE "aws ssm delete-parameter --parameter-name $sessionParameterName"
    fi
    if [ "$websocketParameterName" == "null" ]; then
       echo websocket Parameter not found for environment $envnameLowercase
    else
       echo Deleting websocket parameter $websocketParameterName 
       EXECUTE "aws ssm delete-parameter --parameter-name $websocketParameterName"
    fi
}

function destroyFirehoseIAM() {
    envNameLowercase=$1
    envNameUppercase=$2
    getFirehoseRoleNameUC=$(echo "aws iam list-roles --query 'Roles[?starts_with(@.RoleName,\`"$envnameUppercase"\`)] | [?contains(@.RoleName, \`irehose\`)].RoleName | [0]' | sed -e 's/^\"//' -e 's/\"$//'")
    firehoseRoleNameUC=$(eval $getFirehoseRoleNameUC)
    getFirehoseRoleNameLC=$(echo "aws iam list-roles --query 'Roles[?starts_with(@.RoleName,\`"$envnameLowercase"\`)] | [?contains(@.RoleName, \`irehose\`)].RoleName | [0]' | sed -e 's/^\"//' -e 's/\"$//'")
    firehoseRoleNameLC=$(eval $getFirehoseRoleNameLC)
    if [ "$firehoseRoleNameLC" == "null" ] && [ "$firehoseRoleNameUC" == "null" ]; then
        echo We could not find FIREHOSE ROLES containing the names $envNameLowercase or $envNameUppercase
        export FIREHOSEROLE=""
    else
        if [ "$C9_HOSTNAME" != "" ]; then
           ## Cloud9 doesn't have permissions to change roles configurations.
           echo "It seems that you are running the workshop on Cloud9"
           echo "You are going to need to fix some things by hand."
           echo " Go to IAM and delete the following role: "
           if [ "$firehoseRoleNameLC" != "null" ]; then 
                 echo $firehoseRoleNameLC
                 export FIREHOSEROLE=$firehoseRoleNameLC
           else 
                 echo $firehoseRoleNameUC
                 export FIREHOSEROLE=$firehoseRoleNameUC
           fi
        else 
            if [ "$firehoseRoleNameLC" != "null" ]; then       
                    echo The Role $firehoseRoleNameLC still exists in the environment. You need to remove it manually
                    EXECUTE aws iam delete-role --role-name $firehoseRoleNameLC
            fi
            if [ "$firehoseRoleNameUC" != "null" ]; then
                    # Get the policies and remove it
                    echo Deleting the role $firehoseRoleNameUC
                    EXECUTE aws iam delete-role --role-name $firehoseRoleNameUC
            fi
            export FIREHOSEROLE=""
        fi
    fi
}


function destroyFirehoseResource() {
    envNameLowercase=$1
    envNameUppercase=$2
    getfirehoseUC=$(echo "aws firehose list-delivery-streams --query 'DeliveryStreamNames | [?contains(@,\`"$envNameLowercase"\`)] | [0] ' | sed -e 's/^\"//' -e 's/\"$//'")
    firehoseUC=$( eval $getfirehoseUC )
    getfirehoseLC=$(echo "aws firehose list-delivery-streams --query 'DeliveryStreamNames | [?contains(@,\`"$envNameUppercase"\`)] | [0] ' | sed -e 's/^\"//' -e 's/\"$//'")
    firehoseLC=$( eval $getfirehoseLC ) 
    if [ $firehoseLC == null ] && [ $firehoseUC == null ]; then
        echo We could not find FIREHOSE resources containing the names $envNameLowercase or $envNameUppercase
    else
       if [ $firehoseLC != null ]; then
            echo Deleting the resource $firehoseLC
            EXECUTE aws firehose delete-delivery-stream --delivery-stream-name $firehoseLC
       fi
       if [ $firehoseUC != null ]; then
            echo Deleting the resource $firehoseUC
            EXECUTE aws firehose delete-delivery-stream --delivery-stream-name $firehoseUC
       fi
    fi
}


function destroyFirehose() {
    showHeader "DESTROYING FIREHOSE RESOURCES CREATED BY HAND"
    showSectionTitle Destroying IAM resources
    destroyFirehoseIAM $1 $2
    showSectionTitle Destroying the Kinesis Firehose resource
    destroyFirehoseResource $1 $2
}

function destroyWebsocketInlinePolicy() {
    ### it does not matter if it is uppercase or lowercase
    envname=$1
    getWebsocketPolicyName=$(echo "aws iam list-role-policies --role-name "$envname"WebSocketSynchronizeStartFn_Role  --query 'PolicyNames[?contains(@,\`nvoke\`)] | [0]' | sed -e 's/^\"//' -e 's/\"$//'")
    websocketPolicyName=$( eval $getWebsocketPolicyName )
    if [ "$websocketPolicyName" == "" ]; then
        echo
        echo "We could not find an Invoke-Api-Policy attached. If you have used a different naming standard, please remove it manually."
        export WEBSOCKETROLE=""
    else
        export WEBSOCKETROLE=$envname"WebSocketSynchronizeStartFn_Role"
        if [ "$C9_HOSTNAME" != "" ]; then
           ## Cloud9 doesn't have permissions to change roles configurations.
           echo "It seems that you are running the workshop on Cloud9"
           echo "You are going to need to fix some things by hand."
           echo  Go to IAM and remove the policy $websocketPolicyName from the role $envname"WebSocketSynchronizeStartFn_Role"
        else 
            if [ "$websocketPolicyName" != "null" ]; then
                removeWebsocketPolicy=$(echo "aws iam delete-role-policy --role-name " $envname"WebSocketSynchronizeStartFn_Role --policy-name "$websocketPolicyName)
                EXECUTE eval $removeWebsocketPolicy
                echo "Policy $websocketPolicyName removed from $envname WebSocketSynchronizeStartFn_Role"
                export WEBSOCKETROLE=
            fi
        fi
    fi
}

function destroyWebsocketAPI() {
    envNameLowercase=$1
    envNameUppercase=$2
    # checking uppercase
    getWebsocketAPIIdUC=$(echo "aws apigatewayv2 get-apis --query 'Items[?contains(@.Name,\`$envNameUppercase\`)] | [0] | @.ApiId' | sed -e 's/^\"//' -e 's/\"$//'")
    getWebsocketAPINameUC=$(echo "aws apigatewayv2 get-apis --query 'Items[?contains(@.Name,\`$envNameUppercase\`)] | [0] |@.Name ' | sed -e 's/^\"//' -e 's/\"$//'")
    websocketAPIIdUC=$(eval $getWebsocketAPIIdUC )
    websocketAPINameUC=$(eval $getWebsocketAPINameUC )
    # checking lowercase
    getWebsocketAPIIdLC=$(echo "aws apigatewayv2 get-apis --query 'Items[?contains(@.Name,\`$envNameLowercase\`)]| [0] | @.ApiId' | sed -e 's/^\"//' -e 's/\"$//'")
    getWebsocketAPINameLC=$(echo "aws apigatewayv2 get-apis --query 'Items[?contains(@.Name,\`$envNameLowercase\`)] | [0] |@.Name ' | sed -e 's/^\"//' -e 's/\"$//'")
    websocketAPIIdLC=$(eval $getWebsocketAPIIdLC )
    websocketAPINameLC=$(eval $getWebsocketAPINameLC )
    if [ "$websocketAPIIdUC" == "null" ] && [ "$websocketAPIIdLC" == "null" ] ; then
        echo "We could not find an API related to either to $envNameUppercase or to $envNameLowercase. If you have used a different naming standard, please remove it manually."
    else
        if [ "$websocketAPIIdUC" != "null" ]; then
           deleteWebsocketApiUC=$(echo "aws apigatewayv2 delete-api --api-id $websocketAPIIdUC" )
           EXECUTE eval $deleteWebsocketApiUC
           echo "API with Id "$websocketAPIIdUC" and name "$websocketAPINameUC" deleted successfully."
        fi
        if [ "$websocketAPIIdLC" != "null" ]; then
           deleteWebsocketApiUC=$(echo "aws apigatewayv2 delete-api --api-id $websocketAPIIdLC" )
           EXECUTE eval $deleteWebsocketApiUC
           echo "API with Id "$websocketAPIIdLC" and name "$websocketAPINameLC" deleted successfully."
        fi
    fi
}

function destroyWebsocket() {
    showHeader "DELETING WEBSOCKET CONFIGURATION NOT HANDLED BY CDK"
    envNameLowercase=$1
    envNameUppercase=$2
    showSectionTitle "Remove the invoke policy added by hand in <envName>WebSocketSynchronizeStartFn_Role"
    destroyWebsocketInlinePolicy $envNameLowercase
    showSectionTitle "Destroy the websocket API"
    destroyWebsocketAPI $envNameLowercase $envNameUppercase
}

function destroyLogGroups() {
    showHeader "DELETING LOG GROUP"
    envNameUppercase=$(echo $1 | tr 'a-z' 'A-Z' )
    logDeleteCommand=$(echo "aws logs describe-log-groups --query 'logGroups[?contains(@.logGroupName,\`"$envNameUppercase"\`)].logGroupName' | grep aws | awk  '{ gsub(/\"/, \"\", \$1) ; gsub(\",\",\"\",\$1);  print \$1 } ' | xargs -I{} aws logs delete-log-group --log-group-name {}")
    EXECUTE eval $logDeleteCommand    
}

function destroyS3buckets() {
    showHeader "DESTROYING BUCKETS"
    envNameLowercase=$(echo $1 | tr 'A-Z' 'a-z' )
    deleteAppBucketCmd=$(echo "aws s3 rb s3://$envNameLowercase.app/ --force")
    EXECUTE eval $deleteAppBucketCmd
    echo "Bucket $envNameLowercase.app deleted."
    deleteRawBucketCmd=$(echo "aws s3 rb s3://$envNameLowercase.raw/ --force")
    EXECUTE eval $deleteRawBucketCmd
    echo "Bucket $envNameLowercase.raw deleted."
}

function destroyCDKEnvironment() {
    canrun="false"
    showHeader "CALLING CDK"
    if [ "$FIREHOSEROLE" != "" ]; then
       echo "You need to delete this role manually: $FIREHOSEROLE"
    fi
    if [ "$WEBSOCKETROLE" != "" ]; then
       echo "You need to remove the policy added manually to the role: $WEBSOCKETROLE"
    fi  
    [[  "$FIREHOSEROLE" == ""  &&   "$WEBSOCKETROLE" == ""  ]] && canrun="true" || canrun="false"
    if [ "$canrun" == "true" ]; then
        _curDir=$PWD
        cd cdk
        envnameUppercase=$(echo $1 | tr 'a-z' 'A-Z')
        EXECUTE "cdk destroy -c envname=$envnameUppercase"
        cd $_curDir
    fi
}

function destroy() {
    title DESTROYING THE environment $1
    envname=$1
    envnameUppercase=$(echo $envname | tr 'a-z' 'A-Z')
    envnameLowercase=$(echo $envname | tr 'A-Z' 'a-z')
    echo The environment to be destroyed is ${txtylw}$1${txtrst}
    echo "All resources (IAM, Cognito, Firehose etc) having their names starting with $envnameLowercase or $envnameUppercase will be destroyed."
    read -p "${txtylw} Do you confirm (Y/N)? ${txtrst}"  answer
    answer=$(echo ${answer:0:1} | tr 'a-z' 'A-Z')
    if [ "$answer" != "Y" ]; then
       echo 
       echo Exiting
       echo
    else
       read -p "Do you want the BUCKETS $envnameLowercase.app and $envnameLowercase.raw ${txtylw}to be deleted (Y/N)? ${txtrst}" bucketAnswer
       echo "${txtylw}Beginning destruction...${txtrst}"
       bucketAnswer=$(echo ${bucketAnswer:0:1} | tr 'a-z' 'A-Z')
       destroySSMParameters $envnameLowercase
       destroyFirehose  $envnameLowercase $envnameUppercase
       destroyWebsocket  $envnameLowercase $envnameUppercase
       destroyLogGroups $envnameLowercase $envnameUppercase
       destroyCDKEnvironment $envname
       if [ "$bucketAnswer" == "Y" ]; then
            destroyS3buckets $envNameLowercase
       else
            echo "The buckets $envnameLowercase.app and $envnameLowercase.raw are still available"
       fi
    fi
}

if [ "$envname" == "" ]; then
    echo 
    echo "** DESTROY script**"
    echo Your environment name is undefined.
    echo 
    echo Usage:
    echo "source destroy.sh"
    echo
else
    destroy $envname
    title Finalizing
fi