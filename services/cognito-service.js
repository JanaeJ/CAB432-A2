// Cognito Service for user authentication and management
const { 
  cognitoClient, 
  cognitoConfig, 
  CognitoCommands 
} = require('./aws-config');
const jwt = require('jsonwebtoken');

class CognitoService {
  constructor() {
    this.userPoolId = cognitoConfig.userPoolId;
    this.clientId = cognitoConfig.clientId;
    this.clientSecret = cognitoConfig.clientSecret;
  }

  // ... (保留所有现有方法) ...

  /**
   * Get MFA status and setup data
   * @param {string} username - Username
   * @returns {Promise<Object>} MFA status
   */
  async getMFAStatus(username) {
    try {
      const command = new CognitoCommands.AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: username
      });

      const result = await cognitoClient.send(command);
      
      // Check if MFA is enabled
      const mfaEnabled = result.UserMFASettingList && 
                         result.UserMFASettingList.includes('SOFTWARE_TOKEN_MFA');
      
      if (mfaEnabled) {
        return { 
          success: true, 
          enabled: true,
          message: 'MFA is already enabled'
        };
      }

      // If MFA not enabled, generate setup data
      const associateCommand = new CognitoCommands.AdminAssociateSoftwareTokenCommand({
        UserPoolId: this.userPoolId,
        Username: username
      });

      const associateResult = await cognitoClient.send(associateCommand);

      return {
        success: true,
        enabled: false,
        setupData: {
          secret: associateResult.SecretCode,
          qrCode: this.generateQRCode(username, associateResult.SecretCode)
        }
      };
    } catch (error) {
      console.error('❌ MFA status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate QR code URL for authenticator apps
   * @param {string} username - Username
   * @param {string} secret - Secret key
   * @returns {string} QR code URL
   */
  generateQRCode(username, secret) {
    const issuer = 'Convertool';
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedUsername = encodeURIComponent(username);
    
    return `otpauth://totp/${encodedIssuer}:${encodedUsername}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Verify MFA code and enable MFA
   * @param {string} username - Username
   * @param {string} code - 6-digit MFA code
   * @param {string} secret - Secret key (optional, for initial setup)
   * @returns {Promise<Object>} Verification result
   */
  async verifyMFA(username, code, secret = null) {
    try {
      let verifyCommand;
      
      if (secret) {
        // Initial setup with secret
        verifyCommand = new CognitoCommands.VerifySoftwareTokenCommand({
          UserCode: code,
          FriendlyDeviceName: 'Authenticator App',
          Session: null,
          SecretKey: secret
        });
      } else {
        // Already set up, just verify
        verifyCommand = new CognitoCommands.AdminVerifySoftwareTokenCommand({
          UserPoolId: this.userPoolId,
          Username: username,
          UserCode: code
        });
      }

      const verifyResult = await cognitoClient.send(verifyCommand);

      if (secret) {
        // Enable MFA after successful verification
        const enableCommand = new CognitoCommands.AdminSetUserMFAPreferenceCommand({
          UserPoolId: this.userPoolId,
          Username: username,
          SoftwareTokenMfaSettings: {
            Enabled: true,
            PreferredMfa: true
          }
        });

        await cognitoClient.send(enableCommand);
      }

      return {
        success: true,
        status: secret ? 'enabled' : 'verified',
        message: secret ? 'MFA enabled successfully' : 'MFA code verified'
      };
    } catch (error) {
      console.error('❌ MFA verification error:', error);
      
      if (error.name === 'CodeMismatchException') {
        return {
          success: false,
          error: 'Invalid MFA code'
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Disable MFA for user
   * @param {string} username - Username
   * @param {string} code - Current MFA code (for verification)
   * @returns {Promise<Object>} Disable result
   */
  async disableMFA(username, code) {
    try {
      // First verify the current code
      const verifyResult = await this.verifyMFA(username, code);
      
      if (!verifyResult.success) {
        return verifyResult;
      }

      // Disable MFA
      const disableCommand = new CognitoCommands.AdminSetUserMFAPreferenceCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        SoftwareTokenMfaSettings: {
          Enabled: false,
          PreferredMfa: false
        }
      });

      await cognitoClient.send(disableCommand);

      return {
        success: true,
        message: 'MFA disabled successfully'
      };
    } catch (error) {
      console.error('❌ MFA disable error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List all users in the user pool
   * @param {number} limit - Maximum number of users to return
   * @param {string} paginationToken - Pagination token
   * @returns {Promise<Object>} List of users
   */
  async listUsers(limit = 50, paginationToken = null) {
    try {
      const command = new CognitoCommands.ListUsersCommand({
        UserPoolId: this.userPoolId,
        Limit: limit,
        PaginationToken: paginationToken
      });

      const result = await cognitoClient.send(command);

      const users = result.Users.map(user => {
        const attributes = {};
        user.Attributes.forEach(attr => {
          attributes[attr.Name] = attr.Value;
        });

        return {
          id: user.Username,
          username: user.Username,
          email: attributes.email || '',
          status: user.UserStatus,
          enabled: user.Enabled,
          createdAt: user.UserCreateDate,
          attributes: attributes
        };
      });

      return {
        success: true,
        users: users,
        paginationToken: result.PaginationToken
      };
    } catch (error) {
      console.error('❌ List users error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add user to group
   * @param {string} username - Username
   * @param {string} groupName - Group name
   * @returns {Promise<Object>} Group assignment result
   */
  async addUserToGroup(username, groupName) {
    try {
      const command = new CognitoCommands.AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        GroupName: groupName
      });

      await cognitoClient.send(command);

      console.log(`✅ User ${username} added to group: ${groupName}`);

      return {
        success: true,
        message: `User added to ${groupName} group`
      };
    } catch (error) {
      console.error('❌ Add user to group error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove user from group
   * @param {string} username - Username
   * @param {string} groupName - Group name
   * @returns {Promise<Object>} Group removal result
   */
  async removeUserFromGroup(username, groupName) {
    try {
      const command = new CognitoCommands.AdminRemoveUserFromGroupCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        GroupName: groupName
      });

      await cognitoClient.send(command);

      console.log(`✅ User ${username} removed from group: ${groupName}`);

      return {
        success: true,
        message: `User removed from ${groupName} group`
      };
    } catch (error) {
      console.error('❌ Remove user from group error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List groups for user
   * @param {string} username - Username
   * @returns {Promise<Object>} User's groups
   */
  async listGroupsForUser(username) {
    try {
      const command = new CognitoCommands.AdminListGroupsForUserCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        Limit: 10
      });

      const result = await cognitoClient.send(command);

      const groups = result.Groups.map(group => ({
        name: group.GroupName,
        description: group.Description,
        created: group.CreationDate,
        modified: group.LastModifiedDate
      }));

      return {
        success: true,
        groups: groups
      };
    } catch (error) {
      console.error('❌ List groups for user error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update user role by modifying group membership
   * @param {string} username - Username
   * @param {string} newRole - New role (admin, moderator, user)
   * @param {string} status - User status (active, suspended)
   * @returns {Promise<Object>} Update result
   */
  async updateUserRole(username, newRole, status = 'active') {
    try {
      // First get current groups
      const currentGroups = await this.listGroupsForUser(username);
      
      if (!currentGroups.success) {
        return currentGroups;
      }

      // Remove from all current groups
      for (const group of currentGroups.groups) {
        await this.removeUserFromGroup(username, group.name);
      }

      // Add to new role group
      const groupResult = await this.addUserToGroup(username, newRole);

      if (!groupResult.success) {
        return groupResult;
      }

      // Update user status if needed
      if (status === 'suspended') {
        const disableCommand = new CognitoCommands.AdminDisableUserCommand({
          UserPoolId: this.userPoolId,
          Username: username
        });

        await cognitoClient.send(disableCommand);
      } else if (status === 'active') {
        const enableCommand = new CognitoCommands.AdminEnableUserCommand({
          UserPoolId: this.userPoolId,
          Username: username
        });

        await cognitoClient.send(enableCommand);
      }

      // Update custom role attribute
      await this.updateUserAttributes(username, {
        'custom:role': newRole,
        'custom:status': status
      });

      return {
        success: true,
        message: `User role updated to ${newRole}, status: ${status}`
      };
    } catch (error) {
      console.error('❌ Update user role error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle MFA challenge during authentication
   * @param {string} username - Username
   * @param {string} session - Session token
   * @param {string} code - MFA code
   * @returns {Promise<Object>} Authentication result
   */
  async respondToMFAChallenge(username, session, code) {
    try {
      const command = new CognitoCommands.AdminRespondToAuthChallengeCommand({
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        Session: session,
        ChallengeResponses: {
          USERNAME: username,
          SOFTWARE_TOKEN_MFA_CODE: code
        }
      });

      const result = await cognitoClient.send(command);

      if (result.AuthenticationResult) {
        return {
          success: true,
          tokens: result.AuthenticationResult,
          user: { username }
        };
      } else {
        return {
          success: false,
          error: 'MFA challenge failed'
        };
      }
    } catch (error) {
      console.error('❌ MFA challenge error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new CognitoService();