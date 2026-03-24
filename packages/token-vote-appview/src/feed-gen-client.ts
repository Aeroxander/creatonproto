/**
 * FeedGenClient - Push vote weights to the Feed Generator
 */
export class FeedGenClient {
    constructor(private feedGenUrl: string) { }

    async updateWeight(
        tokenAddress: string,
        subjectUri: string,
        upvoteWeight: string,
        downvoteWeight: string,
        boostAmount?: string,
    ): Promise<void> {
        try {
            const response = await fetch(`${this.feedGenUrl}/admin/update-weights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tokenAddress,
                    subjectUri,
                    upvoteWeight,
                    downvoteWeight,
                    boostAmount,
                }),
            })

            if (!response.ok) {
                console.error(`Failed to update feed gen weight: ${response.status}`)
            }
        } catch (err) {
            console.error('Failed to notify feed generator:', err)
            // Don't throw - feed gen updates are best-effort
        }
    }
}
