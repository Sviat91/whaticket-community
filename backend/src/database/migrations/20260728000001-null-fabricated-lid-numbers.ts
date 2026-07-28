import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE Contacts
         SET number = NULL
       WHERE lid IS NOT NULL
         AND number IS NOT NULL
         AND lid = CONCAT(number, '@lid');
    `);
  },

  down: async (): Promise<void> => {
    // No-op: the nulled values were fabricated LID digits, not real phone
    // numbers, and are intentionally not restorable.
    return Promise.resolve();
  }
};
