import { z } from "zod";

/**
 * x402 Client — Payment Orchestrator
 * 
 * Handles the client-side payment flow:
 * 1. Makes request → gets 402 with payment requirements
 * 2. Executes payment via wallet callback
 * 3. Retries request with X-Payment header
 * 4. Returns verified result
 * 
 * Architecture Decision:
 * We use a callback pattern (`onDirectPayment`) instead of assuming a specific
 * wallet library. This lets the caller inject RainbowKit, Phantom, Sui, or NEAR
 * wallet logic without the payment library knowing the details.
 */

export interface X402PaymentDetails {
  recipient: string;
  amount: string;
  chain: string;
  asset: string;
  maxTimeoutSeconds: number;
}

export interface X402PaymentOptions {
  endpoint: string;
  params: Record<string, unknown>;
  onDirectPayment: (details: X402PaymentDetails) => Promise<string>;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface X402PaymentResult {
  success: boolean;
  response?: unknown;
  error?: string;
  txHash?: string;
}

/**
 * Handle a 402 Payment Required response
 * 
 * Flow:
 * 1. POST to endpoint → expect 402 with payment requirements
 * 2. Parse x402 requirements from response body or headers
 * 3. Call onDirectPayment to execute the wallet transaction
 * 4. Retry request with X-Payment-TxHash header
 * 5. Return final response
 */
export async function handleX402Payment(
  options: X402PaymentOptions
): Promise<X402PaymentResult> {
  const { endpoint, params, onDirectPayment, baseUrl = "", headers = {} } = options;

  try {
    // Step 1: Initial request (expecting 402)
    const initialResponse = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(params),
    });

    // If payment not required, return response directly
    if (initialResponse.status !== 402) {
      const data = await initialResponse.json();
      return {
        success: initialResponse.ok,
        response: data,
      };
    }

    // Step 2: Parse payment requirements
    const paymentData = await initialResponse.json();
    const requirements = parsePaymentRequirements(paymentData, initialResponse.headers);

    if (!requirements) {
      return {
        success: false,
        error: "Could not parse payment requirements from 402 response",
      };
    }

    // Step 3: Execute payment via wallet callback
    let txHash: string;
    try {
      txHash = await onDirectPayment(requirements);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment failed";
      return {
        success: false,
        error: `Payment execution failed: ${message}`,
      };
    }

    // Step 4: Retry with payment proof
    const retryResponse = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment-TxHash": txHash,
        ...headers,
      },
      body: JSON.stringify(params),
    });

    const retryData = await retryResponse.json();

    return {
      success: retryResponse.ok,
      response: retryData,
      txHash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Parse x402 payment requirements from response
 * 
 * Tries multiple formats:
 * 1. JSON body with paymentRequirements field
 * 2. X-Payment-* headers
 * 3. Nested response format
 */
function parsePaymentRequirements(
  data: unknown,
  headers: Headers
): X402PaymentDetails | null {
  // Try JSON body
  if (typeof data === "object" && data !== null) {
    const body = data as Record<string, unknown>;

    // Direct paymentRequirements object
    if (body.paymentRequirements) {
      const req = body.paymentRequirements as Record<string, unknown>;
      return validateRequirements(req);
    }

    // Nested in error or response
    if (body.error && typeof body.error === "object") {
      const error = body.error as Record<string, unknown>;
      if (error.paymentRequirements) {
        return validateRequirements(error.paymentRequirements as Record<string, unknown>);
      }
    }
  }

  // Try headers
  const recipient = headers.get("X-Payment-Recipient");
  const amount = headers.get("X-Payment-Amount");
  const chain = headers.get("X-Payment-Chain");

  if (recipient && amount && chain) {
    return validateRequirements({
      recipient,
      amount,
      chain,
      asset: headers.get("X-Payment-Asset") || "USDC",
      maxTimeoutSeconds: parseInt(headers.get("X-Payment-Timeout") || "300"),
    });
  }

  return null;
}

function validateRequirements(req: Record<string, unknown>): X402PaymentDetails | null {
  try {
    return {
      recipient: String(req.recipient || req.payTo),
      amount: String(req.amount || req.maxAmountRequired),
      chain: String(req.chain || req.network),
      asset: String(req.asset || "USDC"),
      maxTimeoutSeconds: Number(req.maxTimeoutSeconds || 300),
    };
  } catch {
    return null;
  }
}
