
const User = require('../models/User');
const crypto = require('crypto');
const axios = require('axios');

// ============ CONFIGURE MERCHANT WEBHOOK ============
exports.configureMerchantWebhook = async (req, res) => {
    try {
        const merchantId = req.user.id; // From auth middleware (JWT)
        const { webhook_url, events } = req.body;

        // Validate webhook URL
        if (!webhook_url) {
            return res.status(400).json({
                success: false,
                error: 'webhook_url is required'
            });
        }

        if (!isValidUrl(webhook_url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid webhook URL format. Must start with http:// or https://'
            });
        }

        // Generate unique webhook secret for merchant
        const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

        // Update merchant configuration
        const merchant = await User.findById(merchantId);
        
        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        }

        merchant.webhookUrl = webhook_url;
        merchant.webhookSecret = webhookSecret;
        merchant.webhookEnabled = true;
        merchant.webhookEvents = events || ['payment.success', 'payment.failed', 'payment.pending'];
        merchant.webhookRetries = 3; // Default retry attempts

        await merchant.save();

        console.log('✅ Webhook configured for merchant:', merchant.name);

        res.json({
            success: true,
            message: 'Webhook configuration saved successfully',
            webhook_url: merchant.webhookUrl,
            webhook_secret: merchant.webhookSecret,
            webhook_enabled: merchant.webhookEnabled,
            webhook_events: merchant.webhookEvents,
            webhook_retries: merchant.webhookRetries
        });

    } catch (error) {
        console.error('❌ Configure Merchant Webhook Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to configure webhook',
            details: error.message
        });
    }
};

// ============ GET MERCHANT WEBHOOK CONFIG ============
exports.getMerchantWebhookConfig = async (req, res) => {
    try {
        const merchantId = req.user.id;

        const merchant = await User.findById(merchantId).select(
            'webhookUrl webhookSecret webhookEnabled webhookEvents webhookRetries successUrl failureUrl'
        );

        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        }

        res.json({
            success: true,
            webhook_url: merchant.webhookUrl,
            webhook_secret: merchant.webhookSecret,
            webhook_enabled: merchant.webhookEnabled,
            webhook_events: merchant.webhookEvents,
            webhook_retries: merchant.webhookRetries,
            success_url: merchant.successUrl,
            failure_url: merchant.failureUrl
        });

    } catch (error) {
        console.error('❌ Get Merchant Webhook Config Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to get webhook configuration'
        });
    }
};

// ============ TEST MERCHANT WEBHOOK ============
exports.testMerchantWebhook = async (req, res) => {
    try {
        const merchantId = req.user.id;

        const merchant = await User.findById(merchantId);

        if (!merchant || !merchant.webhookUrl) {
            return res.status(400).json({
                success: false,
                error: 'Webhook URL not configured'
            });
        }

        // Send test webhook
        const testPayload = {
            event: 'webhook.test',
            timestamp: new Date().toISOString(),
            merchant_id: merchant._id.toString(),
            data: {
                test: true,
                message: 'This is a test webhook from Ninex Payment Gateway',
                merchant_name: merchant.name
            }
        };

        console.log('📤 Sending test webhook to:', merchant.webhookUrl);

        const result = await this.sendMerchantWebhook(merchant, testPayload);

        res.json({
            success: result.success,
            message: result.success ? 'Test webhook sent successfully' : 'Test webhook failed',
            status: result.status,
            response: result.response,
            error: result.error
        });

    } catch (error) {
        console.error('❌ Test Merchant Webhook Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to send test webhook'
        });
    }
};

// ============ DELETE MERCHANT WEBHOOK ============
exports.deleteMerchantWebhook = async (req, res) => {
    try {
        const merchantId = req.user.id;

        const merchant = await User.findById(merchantId);

        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        }

        merchant.webhookUrl = null;
        merchant.webhookSecret = null;
        merchant.webhookEnabled = false;

        await merchant.save();

        console.log('✅ Webhook deleted for merchant:', merchant.name);

        res.json({
            success: true,
            message: 'Webhook configuration deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete Merchant Webhook Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to delete webhook configuration'
        });
    }
};

// ============ SEND WEBHOOK TO MERCHANT (INTERNAL USE) ============
 exports.sendMerchantWebhook = async (merchant, payload, retries = 3) =>{
    if (!merchant.webhookEnabled || !merchant.webhookUrl) {
        console.log('⚠️ Webhook not enabled for merchant:', merchant.name);
        return { success: false, error: 'Webhook not enabled' };
    }

    // Check if merchant wants this event
    if (payload.event !== 'webhook.test' && !merchant.webhookEvents.includes(payload.event)) {
        console.log('⚠️ Merchant not subscribed to event:', payload.event);
        return { success: false, error: 'Event not subscribed' };
    }

    // Generate webhook signature
    const timestamp = Date.now().toString();
    const signaturePayload = timestamp + JSON.stringify(payload);
    
    const signature = crypto
        .createHmac('sha256', merchant.webhookSecret)
        .update(signaturePayload)
        .digest('hex');

    try {
        console.log(`📤 Sending webhook to merchant: ${merchant.name}`);
        console.log(`🔗 Webhook URL: ${merchant.webhookUrl}`);
        console.log(`📦 Event: ${payload.event}`);

        const response = await axios.post(
            merchant.webhookUrl,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-webhook-signature': signature,
                    'x-webhook-timestamp': timestamp,
                    'x-merchant-id': merchant._id.toString(),
                    'x-event-type': payload.event
                },
                timeout: 10000, // 10 second timeout
                validateStatus: (status) => status < 500 // Don't throw on 4xx
            }
        );

        if (response.status >= 200 && response.status < 300) {
            console.log('✅ Webhook delivered successfully to:', merchant.name);
            return {
                success: true,
                status: response.status,
                response: response.data
            };
        } else {
            console.warn(`⚠️ Webhook returned status ${response.status}`);
            return {
                success: false,
                status: response.status,
                error: `HTTP ${response.status}`,
                response: response.data
            };
        }

    } catch (error) {
        console.error(`❌ Webhook failed for merchant ${merchant.name}:`, error.message);

        // Retry logic
        if (retries > 0 && error.code !== 'ENOTFOUND') {
            console.log(`🔄 Retrying webhook... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            return sendMerchantWebhook(merchant, payload, retries - 1);
        }

        return {
            success: false,
            error: error.message,
            status: error.response?.status,
            code: error.code
        };
    }
}

// ============ HELPER: Validate URL ============
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// Export for use in other controllers

