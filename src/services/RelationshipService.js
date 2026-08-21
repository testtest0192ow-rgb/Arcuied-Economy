const Relationship = require('../models/Relationship');

class AlreadyMarriedError extends Error {
  constructor() {
    super('already_married');
    this.name = 'AlreadyMarriedError';
  }
}
class ProposalNotFoundError extends Error {
  constructor() {
    super('proposal_not_found');
    this.name = 'ProposalNotFoundError';
  }
}
class NotMarriedError extends Error {
  constructor() {
    super('not_married');
    this.name = 'NotMarriedError';
  }
}

class RelationshipService {
  async getActiveMarriage(guildId, userId) {
    return Relationship.findOne({
      guildId,
      status: 'married',
      $or: [{ userAId: userId }, { userBId: userId }],
    }).lean();
  }

  async propose({ guildId, userAId, userBId }) {
    if (userAId === userBId) throw new Error('Нельзя предложить брак самому себе');

    const existingA = await this.getActiveMarriage(guildId, userAId);
    if (existingA) throw new AlreadyMarriedError();
    const existingB = await this.getActiveMarriage(guildId, userBId);
    if (existingB) throw new AlreadyMarriedError();

    return Relationship.create({ guildId, userAId, userBId, status: 'pending' });
  }

  async accept({ relationshipId, userId }) {
    const rel = await Relationship.findOne({ _id: relationshipId, status: 'pending' });
    if (!rel) throw new ProposalNotFoundError();
    if (rel.userBId !== userId) throw new ProposalNotFoundError();

    // Re-check neither side married someone else in the meantime.
    const existingA = await this.getActiveMarriage(rel.guildId, rel.userAId);
    const existingB = await this.getActiveMarriage(rel.guildId, rel.userBId);
    if (existingA || existingB) throw new AlreadyMarriedError();

    rel.status = 'married';
    rel.marriedAt = new Date();
    await rel.save();
    return rel;
  }

  async divorce({ guildId, userId }) {
    const rel = await Relationship.findOneAndUpdate(
      { guildId, status: 'married', $or: [{ userAId: userId }, { userBId: userId }] },
      { status: 'divorced' },
      { new: true }
    );
    if (!rel) throw new NotMarriedError();
    return rel;
  }
}

module.exports = {
  relationshipService: new RelationshipService(),
  AlreadyMarriedError,
  ProposalNotFoundError,
  NotMarriedError,
};
