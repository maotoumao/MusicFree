function makeMatrix(row: number, col: number) {
    return Array(row)
        .fill(0)
        .map(_ => Array(col).fill(Infinity));
}

export default function minDistance(word1?: string, word2?: string): number {
    if (!word1 || !word2) {
        return word1?.length || word2?.length || 0;
    }

    const dp = makeMatrix(word1.length + 1, word2.length + 1);

    for (let i = 0; i <= word1.length; ++i) {
        for (let j = 0; j <= word2.length; ++j) {
            if (i === 0 || j === 0) {
                dp[i][j] = i || j;
                continue;
            }
            const currentStr1 = word1[i - 1];
            const currentStr2 = word2[j - 1];
            if (currentStr1 === currentStr2) {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1],
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                );
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                );
            }
        }
    }

    return dp[word1.length][word2.length];
}
