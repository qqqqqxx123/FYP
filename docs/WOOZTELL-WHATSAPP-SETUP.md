# Wooztell WhatsApp Channel Setup

You can use **both** Baileys (QR-based) and **Wooztell** (WhatsApp Cloud / business channel) at the same time. Baileys is for personal/linked-device connections; Wooztell is for WhatsApp Business API channels.

## 1. Create a WhatsApp channel in Wooztell

1. Log in to [Wooztell](https://woztell.com) and go to **Channels**.
2. Click **+ New Channel** → choose **WhatsApp Cloud Integration** → **Create Channel**.
3. Enter a **Channel Name** and optional description → **Confirm**.
4. Click **Start Setup** and complete the **Embedded Sign-up Flow** to connect your WhatsApp Business Account (WABA) to Wooztell.
5. In the channel **Platform** you’ll see **WhatsApp Number**, **WABA ID**, **Phone Number ID**, etc.

## 2. Link Wooztell to your CRM

- **Option A — Manual:** Note your Wooztell channel ID and WhatsApp number. In the CRM’s **WhatsApp Connect** page, use the “Wooztell WhatsApp Channel” section to paste the channel ID or phone so the CRM can associate it with your account (for future messaging or webhooks).
- **Option B — API:** Use the [Wooztell Public API](https://doc.woztell.com/docs/integrations/whatsapp/wa-cloud-public-api/) with an access token from your channel’s **Advanced Access** settings. Base URL: `https://api.whatsapp-cloud.woztell.sanuker.com/v1.2/api/`. You can call **GET /waba-info** or **GET /whatsapp-business-profile** to get WABA details and store the channel/phone in your CRM.

## 3. Using both Baileys and Wooztell

- **Baileys (QR):** Up to two numbers connected via the Baileys server (scan QR in WhatsApp → Linked Devices). Best for personal or small-team numbers.
- **Wooztell:** One or more WhatsApp Business channels (WABA) for official business messaging, templates, and higher volume.

The CRM’s **WhatsApp Connect** page supports both: the two Baileys slots for QR connections, and a Wooztell section to connect or register your Wooztell channel so the CRM knows which channel to use for sending/receiving via the Wooztell API.
