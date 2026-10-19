import mongoose from 'mongoose';
import crypto from 'crypto';
import { isDbConnected } from '../config/db.js';

const _fallbackAuthStore = new Map();

const pulseAuthSchema = new mongoose.Schema({
  org_id: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  password_hash: {
    type: String,
    required: true,
  },
  salt: {
    type: String,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  last_login: {
    type: Date,
    default: Date.now,
  },
});

export const PulseAuthModel = mongoose.models.PulseAuth || mongoose.model('PulseAuth', pulseAuthSchema);

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 10000, 64, 'sha512').toString('hex');
}

export const PulseAuthRepository = {
  async authenticateOrRegister(orgId, password) {
    if (!orgId || !password) {
      throw new Error('Organization ID and Password are required');
    }
    const cleanOrg = String(orgId).trim().toLowerCase();

    // Use MongoDB if connected
    if (isDbConnected()) {
      try {
        const existing = await PulseAuthModel.findOne({ org_id: cleanOrg });

        if (!existing) {
          // First time registration for this org ID
          const salt = crypto.randomBytes(16).toString('hex');
          const password_hash = hashPassword(password, salt);
          const newAuth = await PulseAuthModel.create({
            org_id: cleanOrg,
            salt,
            password_hash,
            created_at: new Date(),
            last_login: new Date(),
          });
          return {
            success: true,
            isNew: true,
            orgId: cleanOrg,
            id: newAuth._id.toString(),
          };
        }

        // Verify existing password
        const checkHash = hashPassword(password, existing.salt);
        if (checkHash !== existing.password_hash) {
          return {
            success: false,
            error: 'Invalid password for this Organization ID',
          };
        }

        existing.last_login = new Date();
        await existing.save().catch(() => {});

        return {
          success: true,
          isNew: false,
          orgId: cleanOrg,
          id: existing._id.toString(),
        };
      } catch (dbErr) {
        console.warn('[PulseAuth] MongoDB error, falling back to resilient in-memory store:', dbErr.message);
      }
    }

    // Resilient Fallback (In-Memory)
    const existingMemory = _fallbackAuthStore.get(cleanOrg);
    if (!existingMemory) {
      const salt = crypto.randomBytes(16).toString('hex');
      const password_hash = hashPassword(password, salt);
      _fallbackAuthStore.set(cleanOrg, {
        org_id: cleanOrg,
        salt,
        password_hash,
        created_at: new Date(),
        last_login: new Date(),
      });
      return {
        success: true,
        isNew: true,
        orgId: cleanOrg,
        id: `mem_${Date.now()}`,
      };
    }

    const checkHash = hashPassword(password, existingMemory.salt);
    if (checkHash !== existingMemory.password_hash) {
      return {
        success: false,
        error: 'Invalid password for this Organization ID',
      };
    }

    existingMemory.last_login = new Date();
    return {
      success: true,
      isNew: false,
      orgId: cleanOrg,
      id: `mem_${Date.now()}`,
    };
  },

  async findByOrgId(orgId) {
    const cleanOrg = String(orgId).trim().toLowerCase();
    if (isDbConnected()) {
      try {
        return await PulseAuthModel.findOne({ org_id: cleanOrg }).lean();
      } catch {}
    }
    return _fallbackAuthStore.get(cleanOrg) || null;
  },
};
