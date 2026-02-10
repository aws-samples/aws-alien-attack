#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
echo CONFIGURING THE ENVIRONMENT
echo this must run from the 'infrastructure' folder
echo #############################

# Check if isolated environment exists and activate it
if [[ -f "./activate-env.sh" ]]; then
    echo "Activating isolated environment..."
    source ./activate-env.sh
fi

## installing
source ./update-upgrade-install.sh
## Calling the environment configuration
source ./envname.sh
echo ### DONE