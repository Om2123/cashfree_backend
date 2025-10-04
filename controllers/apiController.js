
const crypto = require('crypto');
const User = require('../models/User');

exports.createApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        if (user?.apiKey) {
            return res.status(400).json({ msg: 'API key already exists' });
        }

        const apiKey = `cashcavash_${crypto.randomBytes(16).toString('hex')}`;
        user.apiKey = apiKey;

        await user.save();

        res.json({ apiKey });
    } catch (err) {
        console.log(err.message);
        res.status(500).send('Server error');
    }
};

exports.deleteApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        user.apiKey = null;

        await user.save();

        res.json({ msg: 'API key deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
