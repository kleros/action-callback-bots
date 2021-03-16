const { gql } = require('graphql-request')

// withdrawFeesAndRewards(address payable _beneficiary, address _submissionID, uint _requestID, uint _challengeID, uint _round)
// Conditions:
// - The request must be resolved.
module.exports = async (graph, proofOfHumanity) => {
  const { contributions } = await graph.request(
    gql`
      query withdrawFeesAndRewardsQuery {
        contributions(where: { values_not: [0, 0] }, first: 1000) {
          round {
            challenge {
              request {
                resolved
                submission {
                  id
                  requests(orderBy: creationTime) {
                    id
                  }
                }
                id
                challenges(orderBy: creationTime) {
                  id
                }
              }
              id
              rounds(orderBy: creationTime) {
                id
              }
            }
            id
          }
          contributor
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
          round.challenge.request.submission.requests.findIndex(
            request => request.id === round.challenge.request.id
          ),
          round.challenge.request.challenges.findIndex(
            challenge => challenge.id === round.challenge.id
          ),
          round.challenge.rounds.findIndex(_round => _round.id === round.id)
        ],
        method: proofOfHumanity.methods.withdrawFeesAndRewards,
        to: proofOfHumanity.options.address
      }))
  )
}
