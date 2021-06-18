const { gql } = require('graphql-request')

// withdrawFeesAndRewards(address payable _beneficiary, address _submissionID, uint _requestID, uint _challengeID, uint _round)
// Conditions:
// - The request must be resolved.
module.exports = async (graph, proofOfHumanity) => {
  const { contributions } = await graph.request(
      gql`
        query withdrawFeesAndRewardsQuery($lastId: String) {
          contributions(where: { values_not: [0, 0], requestResolved: true }, first: 100) {
            contributor
            requestIndex
            roundIndex
            round {
              challenge {
                id
                request {
                  submission {
                    id
                  }
                }
              }
            }
          }
        }
      `
  )
  return (
      contributions
          .map(({ requestIndex, roundIndex, contributor, round }) => ({
            args: [
              contributor,
              round.challenge.request.submission.id,
              requestIndex,
              round.challenge.id,
              roundIndex
            ],
            method: proofOfHumanity.methods.withdrawFeesAndRewards,
            to: proofOfHumanity.options.address
          }))
  )
}
