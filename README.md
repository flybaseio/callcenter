Client ACD
==========

## Twilio ACD example

Written with Node.js, HTML, Javascript, and Flybase.  Deployable to Heroku. Embeddable in Salesforce Open CTI.

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

### Flybase Config
- Create a flybase account (https://app.flybase.io/signup)
- Create a flybase app inside your account
- Copy your `API KEY` and App name

### Twilio Config
1. Create a Twilio Appid 
  - you will need this for subseqent steps to set the `twilio_app_id`.
  - Create a Twilio App in Devtool -> TwimlApps -> Create App (note the app id created)
  - Set name - for example-  "Client-acd".    
  - Note the app id created here. You will need it for later.  

2. Buy a Twilio phone number - you will need this for subseqent steps.
  - Note the Phone number created here. You will need it for later for the twilio_caller_id parameter.
  - You will also use this phone number to accept new calls once you create a Heroku (or local tunnel) deploy. You will add to your Twilio voice url: http://myapp.herokuapp.com/voice to accept new calls.

### App Config

- Edit `app/config.js` and add the variables for Twilio and Flybase
- Install necessary node modules: `npm install`
- Test it locally with `node app`

### Salesforce configuration ###
1. Go to Call Centers >  Create
  - Import a call center config included, DemoAdapterTwilio.xml
  -- after import, change the paramter CTI Adapter URL to the Heroku URL created in the first steps https:/<insert yourherokuappurl
  - add yourself to the call center under "Manage Call Center users" > Add more users > (find)
3. You should now see a CTI adapter under the Contact tabs.  However, you want to use the Service Cloud Console for all cti calls (which prevens browser refreshes that would hang up calls)
4. To create a service cloud console
  - Setup > Create > Apps > New
  - Choose "Console" for type of app
  - give it a name, such as "Twilio ACD"
  - Accept default for logo 
  - For tabs, add some tabs to your Service Cloud Console, such as Contacts, Cases
  - accept default for step5 "choose how records display"
  - Set visibility to all (for dev orgs)
  - You've now created an app!  You will see you'r console in the App dropdown, for example "Twilio ACD"

5.  Configuring screenpops
  - you can configure screenpop response, such as to pop the search screen, in Setup > Call Centers >  (your call center) -> Softphone Layout.  

---

## Credits

- Based on the original [client-acd](https://github.com/choppen5/client-acd) written by Charles Oppenheimer aka [choppen5](https://github.com/choppen5), but thanks to the use of Flybase and Node, greatly simplified. :)
