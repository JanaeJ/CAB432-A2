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

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registration result
   */
  async registerUser(userData) {
    try {
      const { username, email, password, attributes = {} } = userData;

      // Prepare user attributes
      const userAttributes = [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' }, // Auto-verify for simplicity
        ...Object.entries(attributes).map(([name, value]) => ({
          Name: name,
          Value: value.toString()
        }))
      ];

      const command = new CognitoCommands.AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        UserAttributes: userAttributes,
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS' // Don't send welcome email
      });

      const result = await cognitoClient.send(command);

      // Set permanent password
      await this.setUserPassword(username, password);

      console.log(`✅ User registered in Cognito: ${username}`);

      return {
        success: true,
        user: {
          username: result.User.Username,
          email: email,
          status: result.User.UserStatus,
          createdAt: result.User.UserCreateDate,
          attributes: result.User.Attributes
        }
      };
    } catch (error) {
      console.error('❌ Cognito registration error:', error);
      
      // Handle specific Cognito errors
      if (error.name === 'UsernameExistsException') {
        throw new Error('Username already exists');
      } else if (error.name === 'InvalidParameterException') {
        throw new Error('Invalid user data provided');
      }
      
      throw new Error(`User registration failed: ${error.message}`);
    }
  }

  /**
   * Set user password (make it permanent)
   * @param {string} username - Username
   * @param {string} password - New password
   * @returns {Promise<Object>} Result
   */
  async setUserPassword(username, password) {
    try {
      const command = new CognitoCommands.AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        Password: password,
        Permanent: true
      });

      await cognitoClient.send(command);

      console.log(`✅ Password set for user: ${username}`);

      return { success: true };
    } catch (error) {
      console.error('❌ Error setting password:', error);
      throw new Error(`Failed to set password: ${error.message}`);
    }
  }

  /**
   * Authenticate user (login)
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Authentication result with tokens
   */
  async authenticateUser(username, password) {
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

      if (result.AuthenticationResult) {
        const { AccessToken, IdToken, RefreshToken, ExpiresIn } = result.AuthenticationResult;

        console.log(`✅ User authenticated: ${username}`);

        return {
          success: true,
          tokens: {
            accessToken: AccessToken,
            idToken: IdToken,
            refreshToken: RefreshToken,
            expiresIn: ExpiresIn
          },
          user: {
            username: username,
            authenticatedAt: new Date().toISOString()
          }
        };
      } else if (result.ChallengeName) {
        // Handle challenge (e.g., NEW_PASSWORD_REQUIRED, MFA)
        return {
          success: false,
          challenge: result.ChallengeName,
          session: result.Session,
          parameters: result.ChallengeParameters
        };
      } else {
        throw new Error('Authentication failed - no result');
      }
    } catch (error) {
      console.error('❌ Cognito authentication error:', error);
      
      // Handle specific authentication errors
      if (error.name === 'NotAuthorizedException') {
        throw new Error('Invalid username or password');
      } else if (error.name === 'UserNotConfirmedException') {
        throw new Error('User account not confirmed');
      } else if (error.name === 'UserNotFoundException') {
        throw new Error('User not found');
      }
      
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Get user information
   * @param {string} username - Username
   * @returns {Promise<Object>} User information
   */
  async getUserInfo(username) {
    try {
      const command = new CognitoCommands.AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: username
      });

      const result = await cognitoClient.send(command);

      // Convert attributes array to object
      const attributes = {};
      result.UserAttributes.forEach(attr => {
        attributes[attr.Name] = attr.Value;
      });

      console.log(`✅ User info retrieved: ${username}`);

      return {
        success: true,
        user: {
          username: result.Username,
          status: result.UserStatus,
          enabled: result.Enabled,
          createdAt: result.UserCreateDate,
          modifiedAt: result.UserLastModifiedDate,
          attributes: attributes
        }
      };
    } catch (error) {
      console.error('❌ Error getting user info:', error);
      
      if (error.name === 'UserNotFoundException') {
        return {
          success: false,
          error: 'User not found'
        };
      }
      
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  /**
   * Update user attributes
   * @param {string} username - Username
   * @param {Object} attributes - Attributes to update
   * @returns {Promise<Object>} Update result
   */
  async updateUserAttributes(username, attributes) {
    try {
      const userAttributes = Object.entries(attributes).map(([name, value]) => ({
        Name: name,
        Value: value.toString()
      }));

      const command = new CognitoCommands.AdminUpdateUserAttributesCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        UserAttributes: userAttributes
      });

      await cognitoClient.send(command);

      console.log(`✅ User attributes updated: ${username}`);

      return {
        success: true,
        updatedAttributes: attributes
      };
    } catch (error) {
      console.error('❌ Error updating user attributes:', error);
      throw new Error(`Failed to update user attributes: ${error.message}`);
    }
  }

  /**
   * Delete user
   * @param {string} username - Username
   * @returns {Promise<Object>} Deletion result
   */
  async deleteUser(username) {
    try {
      const command = new CognitoCommands.AdminDeleteUserCommand({
        UserPoolId: this.userPoolId,
        Username: username
      });

      await cognitoClient.send(command);

      console.log(`✅ User deleted: ${username}`);

      return {
        success: true,
        deletedUsername: username
      };
    } catch (error) {
      console.error('❌ Error deleting user:', error);
      
      if (error.name === 'UserNotFoundException') {
        return {
          success: false,
          error: 'User not found'
        };
      }
      
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * Verify JWT token (for stateless authentication)
   * @param {string} token - JWT token
   * @returns {Promise<Object>} Token verification result
   */
  async verifyToken(token) {
    try {
      // For stateless authentication, we'll decode the JWT without verification
      // In production, you should verify the token signature using Cognito's public keys
      const decoded = jwt.decode(token);
      
      if (!decoded) {
        throw new Error('Invalid token format');
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        throw new Error('Token has expired');
      }

      return {
        success: true,
        user: {
          userId: decoded.sub || decoded.username,
          username: decoded.username || decoded['cognito:username'],
          email: decoded.email,
          groups: decoded['cognito:groups'] || []
        }
      };
    } catch (error) {
      console.error('❌ Token verification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate JWT token for stateless authentication
   * @param {Object} userData - User data
   * @returns {string} JWT token
   */
  generateJWT(userData) {
    const { userId, username, email, role = 'user' } = userData;
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    
    const payload = {
      userId,
      username,
      email,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    return jwt.sign(payload, JWT_SECRET);
  }

  /**
   * Confirm user registration (email verification)
   * @param {string} username - Username
   * @param {string} confirmationCode - Confirmation code from email
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmUserRegistration(username, confirmationCode) {
    try {
      const command = new CognitoCommands.ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: username,
        ConfirmationCode: confirmationCode
      });

      await cognitoClient.send(command);

      console.log(`✅ User registration confirmed: ${username}`);

      return {
        success: true,
        message: 'User registration confirmed successfully'
      };
    } catch (error) {
      console.error('❌ Registration confirmation error:', error);
      
      if (error.name === 'CodeMismatchException') {
        throw new Error('Invalid confirmation code');
      } else if (error.name === 'ExpiredCodeException') {
        throw new Error('Confirmation code has expired');
      } else if (error.name === 'NotAuthorizedException') {
        throw new Error('User is already confirmed');
      }
      
      throw new Error(`Registration confirmation failed: ${error.message}`);
    }
  }
}

module.exports = new CognitoService();
