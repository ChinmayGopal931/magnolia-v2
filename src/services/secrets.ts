import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

export class SecretsService {
  private static cache = new Map<string, string>();
  
  static async getSecret(name: string): Promise<string> {
    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }
    
    try {
      const command = new GetParameterCommand({
        Name: `/magnolia/${name}`,
        WithDecryption: false // Free tier doesn't include encryption
      });
      
      const response = await ssmClient.send(command);
      const value = response.Parameter?.Value || '';
      
      // Cache for Lambda lifetime
      this.cache.set(name, value);
      return value;
    } catch (error) {
      console.error(`Failed to get secret ${name}:`, error);
      // Fallback to environment variable
      return process.env[name.toUpperCase()] || '';
    }
  }
}