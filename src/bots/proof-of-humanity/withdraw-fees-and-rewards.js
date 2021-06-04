const { gql } = require('graphql-request')

// withdrawFeesAndRewards(address payable _beneficiary, address _submissionID, uint _requestID, uint _challengeID, uint _round)
// Conditions:
// - The request must be resolved.
module.exports = async (graph, proofOfHumanity) => {

  let lastContributionID = "";
  let allContributions = [];
  const { contributions } = await graph.request(
      gql`
        query withdrawFeesAndRewardsQuery($lastId: String) {
          contributions(where: { values_not: [0, 0], requestResolved: true }, first: 100) {
            contributor
            id
            requestIndex
            roundIndex
            round {
              id
              challenge {
                request {
                  submission {
                    id
                  }
                  id
                  challenges(orderBy: creationTime) {
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
          // The request must be resolved.
          .filter(contribution => contribution.round.challenge.request.resolved)
          .map(({ contributor, round }) => ({
            args: [
              contributor,
              round.challenge.request.submission.id,
              requestIndex,
              round.challenge.request.challenges.findIndex(
                  challenge => challenge.id === round.challenge.id
              ),
              roundIndex
            ],
            method: proofOfHumanity.methods.withdrawFeesAndRewards,
            to: proofOfHumanity.options.address
          }))
  )
}
