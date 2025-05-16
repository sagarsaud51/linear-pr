import { LinearClient } from '@linear/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { config } from './config.js';
import open from 'open';
import http from 'http';
import url from 'url';

// Define the port for OAuth callback
const OAUTH_PORT = 45678;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;

/**
 * Get or create a Linear client using stored tokens
 */
export async function getLinearClient(): Promise<LinearClient> {
  const accessToken = config.get('linearAccessToken');
  const isApiKey = config.get('isApiKey') === true;
  
  if (!accessToken) {
    throw new Error('Linear is not set up. Run `linear-pr setup` first.');
  }
  
  // Initialize the client differently based on authentication type
  if (isApiKey) {
    return new LinearClient({ apiKey: accessToken });
  } else {
    return new LinearClient({ accessToken });
  }
}

/**
 * Set up Linear authentication - supports both API key and OAuth
 */
export async function setupLinear(): Promise<void> {
  console.log(chalk.blue('Setting up Linear integration'));
  
  // Prompt user for authentication type
  const { authType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'authType',
      message: 'Choose Linear authentication method:',
      choices: [
        { name: 'Personal API Key (recommended)', value: 'apiKey' },
        { name: 'OAuth (requires OAuth app setup)', value: 'oauth' }
      ]
    }
  ]);
  
  if (authType === 'apiKey') {
    await setupWithApiKey();
  } else {
    await setupWithOAuth();
  }
}

/**
 * Set up Linear using personal API key
 */
async function setupWithApiKey(): Promise<void> {
  console.log(chalk.yellow('To get your Personal API key:'));
  console.log('1. Go to Linear → your avatar/profile → Personal Settings');
  console.log('2. Select "API" from the menu');
  console.log('3. Under "Personal API keys", create a new key');
  console.log('4. Copy the generated key (you\'ll only see it once)\n');
  
  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your Linear Personal API key:',
      validate: (input) => !!input || 'API key is required'
    }
  ]);
  
  // Verify the token works
  try {
    const client = new LinearClient({ apiKey: token });
    const viewer = await client.viewer;
    console.log(chalk.green(`✅ Connected to Linear as ${viewer.name}`));
    
    // Save the token and mark it as an API key
    config.set('linearAccessToken', token);
    config.set('isApiKey', true);
  } catch (error) {
    console.error(chalk.red('Error connecting to Linear:'), 
      error instanceof Error ? error.message : 'Invalid token');
    throw new Error('Failed to connect to Linear');
  }
}

/**
 * Set up Linear using OAuth2
 */
async function setupWithOAuth(): Promise<void> {
  console.log(chalk.blue('Setting up Linear integration using OAuth'));
  
  // Check if we have OAuth client credentials
  const clientId = config.get('linearOAuthClientId');
  const clientSecret = config.get('linearOAuthClientSecret');
  
  if (!clientId || !clientSecret) {
    console.log(chalk.yellow('OAuth credentials not found.'));
    console.log(chalk.yellow(`Please run \`linear-pr config-oauth\` first to configure your OAuth credentials.`));
    throw new Error('OAuth credentials not configured');
  }
  
  console.log(chalk.yellow('You will be redirected to Linear to authorize this application.'));
  
  try {
    const accessToken = await performOAuth2Flow(clientId, clientSecret);
    
    // Verify the token works
    const client = new LinearClient({ accessToken });
    const viewer = await client.viewer;
    
    console.log(chalk.green(`✅ Connected to Linear as ${viewer.name}`));
    
    // Save the token and mark it as NOT an API key
    config.set('linearAccessToken', accessToken);
    config.set('isApiKey', false);
  } catch (error) {
    console.error(chalk.red('Error connecting to Linear:'), 
      error instanceof Error ? error.message : 'Authentication failed');
    throw new Error('Failed to connect to Linear');
  }
}

/**
 * Perform the OAuth2 flow to get an access token
 */
async function performOAuth2Flow(clientId: string, clientSecret: string): Promise<string> {
  const SCOPES = ['read', 'write'];
  
  return new Promise((resolve, reject) => {
    // Create a secure random state parameter to prevent CSRF attacks
    const state = Math.random().toString(36).substring(2, 15);
    
    // Create the authorization URL
    const authUrl = new URL('https://linear.app/oauth/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', SCOPES.join(','));
    
    console.log(chalk.cyan('Opening browser to authorize Linear...'));
    
    // Open the authorization URL in the user's browser
    open(authUrl.toString());
    
    // Create a server to handle the callback
    const server = http.createServer(async (req, res) => {
      try {
        // Parse the request URL
        const parsedUrl = url.parse(req.url || '', true);
        const { pathname, query } = parsedUrl;
        
        // Check if this is the callback route
        if (pathname === '/callback') {
          // Close the response with a success message
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can close this window and return to the CLI.</p>');
          
          // Validate the state parameter to prevent CSRF attacks
          if (query.state !== state) {
            server.close();
            reject(new Error('Invalid state parameter'));
            return;
          }
          
          // Check for error in the callback
          if (query.error) {
            server.close();
            reject(new Error(`Authorization error: ${query.error}`));
            return;
          }
          
          // Get the authorization code
          const code = query.code;
          if (!code) {
            server.close();
            reject(new Error('No authorization code returned'));
            return;
          }
          
          try {
            // Exchange the code for an access token
            const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: REDIRECT_URI,
                code,
                grant_type: 'authorization_code'
              })
            });
            
            if (!tokenResponse.ok) {
              const errorData = await tokenResponse.json();
              throw new Error(`Token exchange failed: ${JSON.stringify(errorData)}`);
            }
            
            const tokenData = await tokenResponse.json();
            
            // Close the server and resolve with the access token
            server.close();
            resolve(tokenData.access_token);
          } catch (error) {
            server.close();
            reject(error);
          }
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1><p>Please try again.</p>');
        server.close();
        reject(error);
      }
    });
    
    // Start the server on the specified port
    server.listen(OAUTH_PORT, () => {
      console.log(chalk.yellow(`Waiting for authentication...`));
    });
    
    // Add a timeout to prevent the server from running indefinitely
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Get the current authenticated Linear user
 */
export async function getCurrentUser() {
  const client = await getLinearClient();
  const viewer = await client.viewer;
  
  return {
    id: viewer.id,
    name: viewer.name,
    email: viewer.email
  };
}

/**
 * Get Linear task by ID with extended information
 */
export async function getTask(taskId: string, checkAssignment = false) {
  const client = await getLinearClient();
  
  try {
    // Parse the issue identifier
    const [teamKey, issueNumber] = taskId.split('-');
    const issueNumberInt = parseInt(issueNumber, 10);
    
    if (!teamKey || isNaN(issueNumberInt)) {
      throw new Error(`Invalid task ID format: ${taskId}`);
    }
    
    // Query issues with more fields including assignee and project
    const { nodes } = await client.issues({
      filter: {
        team: { key: { eq: teamKey } },
        number: { eq: issueNumberInt }
      }
    });
    
    if (!nodes || nodes.length === 0) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const issue = nodes[0];
    
    // Get the project name if available
    let projectName = null;
    if (issue.project) {
      const project = await issue.project;
      if (project) {
        projectName = project.name;
      }
    }
    
    // Check if the current user is the assignee of this issue
    let isAssigned = false;
    if (checkAssignment) {
      const currentUser = await getCurrentUser();
      if (issue.assignee) {
        const assignee = await issue.assignee;
        isAssigned = assignee?.id === currentUser.id;
      }
    }
    
    return {
      id: issue.id,
      taskId: issue.identifier,
      title: issue.title,
      description: issue.description || '',
      url: issue.url,
      projectName,
      isAssigned
    };
  } catch (error) {
    throw new Error(`Failed to fetch Linear task: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if the current user is assigned to the given task
 */
export async function isTaskAssignedToCurrentUser(taskId: string): Promise<boolean> {
  try {
    const task = await getTask(taskId, true);
    return task.isAssigned;
  } catch (error) {
    return false;
  }
}

/**
 * Update a Linear task with a PR link
 */
export async function attachPRToTask(taskId: string, prUrl: string): Promise<void> {
  const client = await getLinearClient();
  
  try {
    // Get the task
    const task = await getTask(taskId);
    
    // Make a direct HTTP request to the Linear API to add a comment
    const accessToken = config.get('linearAccessToken');
    const isApiKey = config.get('isApiKey') === true;
    
    // Create the headers object
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Add the appropriate authentication header
    if (isApiKey) {
      headers['X-API-Key'] = accessToken as string;
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `
          mutation CreateComment($issueId: String!, $body: String!) {
            commentCreate(input: {
              issueId: $issueId
              body: $body
            }) {
              success
            }
          }
        `,
        variables: {
          issueId: task.id,
          body: `Created PR: ${prUrl}`
        }
      })
    });
    
    const result = await response.json();
    
    if (!result?.data?.commentCreate?.success) {
      console.warn('Comment creation may have failed, but continuing anyway.');
    }
  } catch (error) {
    console.warn(chalk.yellow(`Could not add PR link to Linear task: ${error instanceof Error ? error.message : String(error)}`));
  }
} 