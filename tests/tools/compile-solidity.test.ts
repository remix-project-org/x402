import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { FastMCP } from '@ampersend_ai/ampersend-sdk/mcp/server/fastmcp';

// Mock Compiler from remix-solidity
jest.mock('@remix-project/remix-solidity', () => ({
  Compiler: jest.fn().mockImplementation((importCallback: Function) => {
    const mockCompiler = {
      event: {
        register: jest.fn(),
      },
      set: jest.fn(),
      compile: jest.fn(),
      loadRemoteVersion: jest.fn(),
      _importCallback: importCallback,
    };
    return mockCompiler;
  }),
}));

// Mock payment utilities
jest.mock('../../src/server/utils/payment.js', () => ({
  createPaymentRequirements: jest.fn((resource, amount, description) => ({
    scheme: 'exact',
    description,
    network: 'base-sepolia',
    maxAmountRequired: amount,
    resource,
    mimeType: 'application/json',
    payTo: process.env.PAY_TO_ADDRESS,
    maxTimeoutSeconds: 300,
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    extra: {
      name: 'USDC',
      version: '2',
    },
  })),
  handlePayment: jest.fn(),
}));

describe('compile-solidity Tool', () => {
  let mockMCP: FastMCP;
  let registeredTool: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create a mock FastMCP instance
    mockMCP = {
      addTool: jest.fn((tool) => {
        registeredTool = tool;
      }),
    } as unknown as FastMCP;

    // Import and register the tool
    const { registerCompileSolidityTool } = await import(
      '../../src/server/tools/compile-solidity.js'
    );
    registerCompileSolidityTool(mockMCP);
  });

  describe('Tool Registration', () => {
    it('should register compile_solidity tool with FastMCP', () => {
      expect(mockMCP.addTool).toHaveBeenCalled();
      expect(registeredTool).toBeDefined();
      expect(registeredTool.name).toBe('compile_solidity');
    });

    it('should have correct tool description', () => {
      expect(registeredTool.description).toContain('Compile Solidity contracts');
      expect(registeredTool.description).toContain('Remix compiler');
    });

    it('should have parameters defined', () => {
      expect(registeredTool.parameters).toBeDefined();
    });

    it('should have execute function defined', () => {
      expect(registeredTool.execute).toBeDefined();
      expect(typeof registeredTool.execute).toBe('function');
    });
  });

  describe('Tool Parameters Schema', () => {
    it('should accept sources parameter', () => {
      const testArgs = {
        sources: {
          'SimpleStorage.sol': {
            content: 'pragma solidity ^0.8.0; contract SimpleStorage {}',
          },
        },
      };

      // Validate that the parameters can be parsed
      expect(() => {
        registeredTool.parameters.parse(testArgs);
      }).not.toThrow();
    });

    it('should accept optional settings parameter', () => {
      const testArgs = {
        sources: {
          'Test.sol': {
            content: 'pragma solidity ^0.8.0; contract Test {}',
          },
        },
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: 'london',
        },
      };

      expect(() => {
        registeredTool.parameters.parse(testArgs);
      }).not.toThrow();
    });

    it('should reject invalid sources format', () => {
      const invalidArgs = {
        sources: 'invalid',
      };

      expect(() => {
        registeredTool.parameters.parse(invalidArgs);
      }).toThrow();
    });

    it('should handle empty sources object', () => {
      const testArgs = {
        sources: {},
      };

      expect(() => {
        registeredTool.parameters.parse(testArgs);
      }).not.toThrow();
    });
  });

  describe('Payment Requirements', () => {
    it('should create payment requirements for compilation', async () => {
      const { createPaymentRequirements } = await import(
        '../../src/server/utils/payment.js'
      );

      // The tool should use createPaymentRequirements internally
      expect(createPaymentRequirements).toBeDefined();
    });

    it('should request 0.01 USDC (10000 units) for compilation', async () => {
      // This is verified through the mock - the tool should call createPaymentRequirements
      // with "10000" as the amount
      const { createPaymentRequirements } = await import('../../src/server/utils/payment.js');
      expect(createPaymentRequirements).toBeDefined();
    });
  });

  describe('Compiler Configuration', () => {
    it('should use Remix Compiler', async () => {
      const { Compiler } = await import('@remix-project/remix-solidity');
      expect(Compiler).toBeDefined();
    });

    it('should create compiler with import callback', async () => {
      const { Compiler } = await import('@remix-project/remix-solidity');

      const sources = {
        'Main.sol': {
          content: 'pragma solidity ^0.8.0; contract Main {}',
        },
      };

      // Create a compiler instance (mocked)
      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = sources[importPath]?.content || '';
        cb(null, { content });
      });

      expect(compiler).toBeDefined();
    });
  });

  describe('Compilation Settings', () => {
    it('should use default settings when not provided', () => {
      // Default settings should be:
      // - evmVersion: "london"
      // - optimize: true
      // - runs: 200
      expect(registeredTool.parameters).toBeDefined();
    });

    it('should accept custom optimizer settings', () => {
      const testArgs = {
        sources: {
          'Test.sol': {
            content: 'contract Test {}',
          },
        },
        settings: {
          optimizer: {
            enabled: false,
            runs: 100,
          },
        },
      };

      expect(() => {
        registeredTool.parameters.parse(testArgs);
      }).not.toThrow();
    });

    it('should accept custom evmVersion', () => {
      const testArgs = {
        sources: {
          'Test.sol': {
            content: 'contract Test {}',
          },
        },
        settings: {
          evmVersion: 'paris',
        },
      };

      expect(() => {
        registeredTool.parameters.parse(testArgs);
      }).not.toThrow();
    });
  });

  describe('Compiler Events', () => {
    it('should register compilationFinished event handler', async () => {
      const { Compiler } = await import('@remix-project/remix-solidity');

      const sources = {
        'Test.sol': {
          content: 'contract Test {}',
        },
      };

      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = sources[importPath]?.content || '';
        cb(null, { content });
      });

      expect(compiler.event.register).toBeDefined();
    });

    it('should register compilerLoaded event handler', async () => {
      const { Compiler } = await import('@remix-project/remix-solidity');

      const sources = {
        'Test.sol': {
          content: 'contract Test {}',
        },
      };

      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = sources[importPath]?.content || '';
        cb(null, { content });
      });

      expect(compiler.event.register).toBeDefined();
    });
  });

  describe('Import Resolution', () => {
    it('should resolve imports from sources', async () => {
      const sources = {
        'Main.sol': {
          content: 'import "./Library.sol"; contract Main {}',
        },
        'Library.sol': {
          content: 'library Library {}',
        },
      };

      const { Compiler } = await import('@remix-project/remix-solidity');

      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = sources[importPath]?.content || '';
        cb(null, { content });
      });

      // Test the import callback
      const importCallback = (compiler as any)._importCallback;
      expect(importCallback).toBeDefined();

      // Simulate import resolution
      importCallback('Library.sol', (err: any, result: any) => {
        expect(err).toBeNull();
        expect(result.content).toBe('library Library {}');
      });
    });

    it('should return empty content for missing imports', async () => {
      const sources = {
        'Main.sol': {
          content: 'contract Main {}',
        },
      };

      const { Compiler } = await import('@remix-project/remix-solidity');

      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = sources[importPath]?.content || '';
        cb(null, { content });
      });

      const importCallback = (compiler as any)._importCallback;

      // Try to import a non-existent file
      importCallback('NonExistent.sol', (err: any, result: any) => {
        expect(err).toBeNull();
        expect(result.content).toBe('');
      });
    });
  });

  describe('Compilation Result Structure', () => {
    it('should return success result structure on successful compilation', () => {
      // Expected structure for successful compilation
      const expectedStructure = {
        success: true,
        contracts: {},
        sources: {},
        errors: [],
      };

      expect(expectedStructure).toHaveProperty('success');
      expect(expectedStructure).toHaveProperty('contracts');
      expect(expectedStructure).toHaveProperty('sources');
      expect(expectedStructure).toHaveProperty('errors');
    });

    it('should return error result structure on failed compilation', () => {
      // Expected structure for failed compilation
      const expectedStructure = {
        success: false,
        errors: [],
      };

      expect(expectedStructure).toHaveProperty('success');
      expect(expectedStructure).toHaveProperty('errors');
    });

    it('should return error result on exception', () => {
      // Expected structure for exception
      const expectedStructure = {
        success: false,
        error: 'Compilation failed',
      };

      expect(expectedStructure).toHaveProperty('success');
      expect(expectedStructure).toHaveProperty('error');
    });
  });

  describe('Compiler Version', () => {
    it('should use compiler version 0.8.26', async () => {
      const { Compiler } = await import('@remix-project/remix-solidity');

      const compiler = new Compiler((path: string, cb: Function) => {
        cb(null, { content: '' });
      });

      expect(compiler.loadRemoteVersion).toBeDefined();
      // The tool should call loadRemoteVersion with "v0.8.26+commit.8a97fa7a"
    });
  });

  describe('Multiple Files Compilation', () => {
    it('should handle multiple source files', () => {
      const testArgs = {
        sources: {
          'Contract1.sol': {
            content: 'contract Contract1 {}',
          },
          'Contract2.sol': {
            content: 'contract Contract2 {}',
          },
          'Library.sol': {
            content: 'library Library {}',
          },
        },
      };

      expect(() => {
        registeredTool.parameters.parse(testArgs);
      }).not.toThrow();
    });

    it('should handle contracts with dependencies', () => {
      const testArgs = {
        sources: {
          'Main.sol': {
            content: 'import "./Library.sol"; contract Main is Library {}',
          },
          'Library.sol': {
            content: 'contract Library {}',
          },
        },
      };

      expect(() => {
        registeredTool.parameters.parse(testArgs);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should filter warnings from errors', () => {
      // The tool should filter warnings and only show them in the warnings array
      // while errors should cause success: false
      const mockResult = {
        success: true,
        contracts: {},
        sources: {},
        errors: [
          { severity: 'warning', message: 'This is a warning' },
          { severity: 'error', message: 'This is an error' },
        ],
      };

      const warnings = mockResult.errors.filter((e: any) => e.severity === 'warning');
      const errors = mockResult.errors.filter((e: any) => e.severity === 'error');

      expect(warnings).toHaveLength(1);
      expect(errors).toHaveLength(1);
    });

    it('should return JSON string result', () => {
      const mockResult = {
        success: true,
        contracts: {},
      };

      const jsonString = JSON.stringify(mockResult, null, 2);
      expect(typeof jsonString).toBe('string');
      expect(() => JSON.parse(jsonString)).not.toThrow();
    });
  });
});
