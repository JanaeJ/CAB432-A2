// services/mfa-service.js
const { 
  cognitoClient, 
  CognitoCommands 
} = require('./aws-config');

class MFAService {
  constructor() {
    this.userPoolId = process.env.COGNITO_USER_POOL_ID;
    this.clientId = process.env.COGNITO_CLIENT_ID;
  }

  /**
   * Associate software token for TOTP MFA
   * @param {string} accessToken - User's access token
   * @returns {Promise<string>} Secret code for QR generation
   */
  async associateSoftwareToken(accessToken) {
    try {
      const command = new CognitoCommands.AssociateSoftwareTokenCommand({
        AccessToken: accessToken
      });

      const result = await cognitoClient.send(command);
      
      console.log('Software token associated successfully');
      return {
        success: true,
        secretCode: result.SecretCode,
        session: result.Session
      };
    } catch (error) {
      console.error('Error associating software token:', error);
      throw new Error(`Failed to associate software token: ${error.message}`);
    }
  }

  /**
   * Verify software token setup
   * @param {string} accessToken - User's access token
   * @param {string} userCode - TOTP code from user's authenticator app
   * @param {string} session - Session from associate step
   * @returns {Promise<Object>} Verification result
   */
  async verifySoftwareToken(accessToken, userCode, session) {
    try {
      const command = new CognitoCommands.VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: userCode,
        Session: session
      });

      const result = await cognitoClient.send(command);
      
      console.log('Software token verified successfully');
      return {
        success: true,
        status: result.Status,
        session: result.Session
      };
    } catch (error) {
      console.error('Error verifying software token:', error);
      throw new Error(`Failed to verify software token: ${error.message}`);
    }
  }

  /**
   * Set user MFA preference
   * @param {string} accessToken - User's access token
   * @param {boolean} enabled - Whether to enable TOTP MFA
   * @returns {Promise<Object>} Result
   */
  async setUserMFAPreference(accessToken, enabled = true) {
    try {
      const command = new CognitoCommands.SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: {
          Enabled: enabled,
          PreferredMfa: enabled
        }
      });

      await cognitoClient.send(command);
      
      console.log(`MFA preference set to: ${enabled}`);
      return {
        success: true,
        message: `MFA ${enabled ? 'enabled' : 'disabled'} successfully`
      };
    } catch (error) {
      console.error('Error setting MFA preference:', error);
      throw new Error(`Failed to set MFA preference: ${error.message}`);
    }
  }

  /**
   * Initiate Auth with MFA
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Auth result (may require MFA)
   */
  async initiateAuthWithMFA(username, password) {
    try {
      const command = new CognitoCommands.AdminInitiateAuthCommand({
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      });

      const result = await cognitoClient.send(command);
      
      if (result.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        return {
          success: true,
          challengeName: result.ChallengeName,
          session: result.Session,
          message: 'MFA code required'
        };
      }

      return {
        success: true,
        authResult: result.AuthenticationResult,
        message: 'Authentication successful'
      };
    } catch (error) {
      console.error('Error during auth:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Respond to MFA challenge
   * @param {string} username - Username
   * @param {string} mfaCode - MFA code from authenticator
   * @param {string} session - Session from initiate auth
   * @returns {Promise<Object>} Final auth result
   */
  async respondToMFAChallenge(username, mfaCode, session) {
    try {
      const command = new CognitoCommands.AdminRespondToAuthChallengeCommand({
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        ChallengeResponses: {
          USERNAME: username,
          SOFTWARE_TOKEN_MFA_CODE: mfaCode
        },
        Session: session
      });

      const result = await cognitoClient.send(command);
      
      return {
        success: true,
        authResult: result.AuthenticationResult,
        message: 'MFA authentication successful'
      };
    } catch (error) {
      console.error('Error responding to MFA challenge:', error);
      throw new Error(`MFA challenge failed: ${error.message}`);
    }
  }

  /**
   * Generate QR code URL for TOTP setup
   * @param {string} username - Username
   * @param {string} secretCode - Secret code from associate step
   * @returns {string} QR code URL
   */
  generateQRCodeURL(username, secretCode) {
    const appName = 'MediaProcessor';
    const label = `${appName}:${username}`;
    const issuer = encodeURIComponent(appName);
    
    return `otpauth://totp/${encodeURIComponent(label)}?secret=${secretCode}&issuer=${issuer}`;
  }
}

module.exports = new MFAService();