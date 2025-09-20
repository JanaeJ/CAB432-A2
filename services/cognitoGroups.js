// services/cognitoGroups.js
// 简化版的用户组管理，暂时使用本地实现，后续可以替换为真正的Cognito Groups

const userGroups = new Map();

// 初始化一些默认的用户组
userGroups.set('admin', 'Admin');
userGroups.set('user', 'User');

// 用户所属组的映射（用户名 -> 组列表）
const userGroupMembership = new Map();

// 添加默认用户组关系
userGroupMembership.set('admin', ['Admin']);
userGroupMembership.set('user', ['User']);

/**
 * 检查用户是否属于指定组
 * @param {string} username - 用户名
 * @param {string} groupName - 组名
 * @returns {boolean} 是否属于该组
 */
function isUserInGroup(username, groupName) {
  const userGroups = userGroupMembership.get(username) || [];
  return userGroups.includes(groupName);
}

/**
 * 获取用户所属的所有组
 * @param {string} username - 用户名
 * @returns {Array} 用户组列表
 */
function getUserGroups(username) {
  return userGroupMembership.get(username) || [];
}

/**
 * 将用户添加到组
 * @param {string} username - 用户名
 * @param {string} groupName - 组名
 */
function addUserToGroup(username, groupName) {
  let userGroups = userGroupMembership.get(username) || [];
  if (!userGroups.includes(groupName)) {
    userGroups.push(groupName);
    userGroupMembership.set(username, userGroups);
  }
}

/**
 * 从组中移除用户
 * @param {string} username - 用户名
 * @param {string} groupName - 组名
 */
function removeUserFromGroup(username, groupName) {
  let userGroups = userGroupMembership.get(username) || [];
  userGroups = userGroups.filter(group => group !== groupName);
  userGroupMembership.set(username, userGroups);
}

/**
 * 权限检查中间件
 * @param {string|Array} allowedGroups - 允许的组名（字符串或数组）
 * @returns {Function} Express中间件函数
 */
function requireGroup(allowedGroups) {
  // 确保allowedGroups是数组
  const groupsArray = Array.isArray(allowedGroups) ? allowedGroups : [allowedGroups];
  
  return (req, res, next) => {
    try {
      const username = req.user?.username;
      
      if (!username) {
        return res.status(401).json({ 
          error: 'Authentication required' 
        });
      }

      // 获取用户的所有组
      const userGroups = getUserGroups(username);
      
      // 检查用户是否属于允许的组
      const hasRequiredGroup = groupsArray.some(group => 
        userGroups.includes(group)
      );

      if (!hasRequiredGroup) {
        return res.status(403).json({ 
          error: `Insufficient permissions. Required groups: ${groupsArray.join(', ')}`,
          userGroups: userGroups
        });
      }

      // 将用户组信息添加到请求对象
      req.user.groups = userGroups;
      next();
    } catch (error) {
      console.error('Group permission check error:', error);
      res.status(500).json({ 
        error: 'Permission verification failed' 
      });
    }
  };
}

module.exports = {
  requireGroup,
  isUserInGroup,
  getUserGroups,
  addUserToGroup,
  removeUserFromGroup
};