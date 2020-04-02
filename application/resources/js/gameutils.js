// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0


class GameUtils {

    static scoreboardSortingFunction(playerA, playerB) {
            let result = null;
            if (playerB.Score != playerA.Score) result = playerB.Score - playerA.Score; // order per score descending
            else if (playerA.Lives != playerB.Lives) result = playerB.Lives - playerA.Lives; // order per lives descending
            else if (playerA.Shots != playerB.Shots) result = playerA.Shots - playerB.Shots; // order per shots ascending
            else result = ((playerA.Nickname > playerB.Nickname) ? 1 : -1); // deuce: order per nickname ascending
            return result;
        };
}