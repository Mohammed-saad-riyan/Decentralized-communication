export type DecentraVoiceMvp = {
  "version": "0.1.0",
  "name": "decentra_voice_mvp",
  "instructions": [
    {
      "name": "createChannel",
      "accounts": [
        {
          "name": "channel",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "joinChannel",
      "accounts": [
        {
          "name": "channel",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        }
      ]
    },
    {
      "name": "leaveChannel",
      "accounts": [
        {
          "name": "channel",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        }
      ]
    },
    {
      "name": "getChannelInfo",
      "accounts": [
        {
          "name": "channel",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Channel",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "string"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "creator",
            "type": "publicKey"
          },
          {
            "name": "participantCount",
            "type": "u32"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "ChannelNotFound",
      "msg": "Channel not found"
    },
    {
      "code": 6001,
      "name": "ChannelInactive",
      "msg": "Channel is not active"
    },
    {
      "code": 6002,
      "name": "UnauthorizedAccess",
      "msg": "Unauthorized access to channel"
    }
  ]
}

export const IDL: DecentraVoiceMvp = {
  "version": "0.1.0",
  "name": "decentra_voice_mvp",
  "instructions": [
    {
      "name": "createChannel",
      "accounts": [
        {
          "name": "channel",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "joinChannel",
      "accounts": [
        {
          "name": "channel",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        }
      ]
    },
    {
      "name": "leaveChannel",
      "accounts": [
        {
          "name": "channel",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        }
      ]
    },
    {
      "name": "getChannelInfo",
      "accounts": [
        {
          "name": "channel",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "channelId",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Channel",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "string"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "creator",
            "type": "publicKey"
          },
          {
            "name": "participantCount",
            "type": "u32"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "ChannelNotFound",
      "msg": "Channel not found"
    },
    {
      "code": 6001,
      "name": "ChannelInactive",
      "msg": "Channel is not active"
    },
    {
      "code": 6002,
      "name": "UnauthorizedAccess",
      "msg": "Unauthorized access to channel"
    }
  ]
} 