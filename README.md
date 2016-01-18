Client ACD
==========

## Twilio ACD example

### Powered By:

- Node.js / JavaScript
- HTML
- Flybase for real-time communcation and data storage.
- Deployable to Heroku.
- Embeddable in Salesforce Open CTI.

##Features

- Agent presence (ready/not ready buttons)
- Twilio Queues
- Automatic Call Distribution (ACD) - Delivering call from Twilio Queues to the longest availible agent
- Twilio Client - delivery to calls in the browser
- Real-time notifications of calls in queue, ready agents
- Outbound calls, click2call from Salesforce
- Hold
- Mute

### Pre requisites:

- Twilio Account, Account SID, Auth Token
- Heroku account, heroku installed
- Flybase.io account setup
- Git, account setup

For Salesforce OpenCTI:
- Salesforce instance, ability to create a Call Center 

### Install:

To get your configuration variables:

### Twilio Config
- Create a Twilio Appid 
  - you will need this for subseqent steps to set the twilio_app_id.
- Create a Twilio App in Devtool -> TwimlApps -> Create App (note the app id created)
  - Set name - for example-  "Client-acd".    
  - Note the app id created here. You will need it for later.  
    - After you create a Heroku app below, you will need to come back to this Twilio Application, and set the Voice URL to point to your newely created Heroku URL + /dial.
      - For example, http://myapp.herokuapp.com/dial will be the URL for this App

- Buy a Twilio phone number - you will need this for subseqent steps.
  - Note the Phone number created here. You will need it for later for the twilio_caller_id parameter.
  - You will also use this phone number to accept new calls once you create a Heroku (or local tunnel) deploy. You will add to your Twilio voice url: http://myapp.herokuapp.com/voice to accept new calls.

## To be continued

The rest will be added as we finish the app :)

---

## Credits

- Based on the original [client-acd](https://github.com/choppen5/client-acd) written by Charles Oppenheimer aka [choppen5](https://github.com/choppen5), but thanks to the use of Flybase and Node, greatly simplified. :)
