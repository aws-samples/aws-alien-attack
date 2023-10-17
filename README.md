# ![](images/awsalienattack.png)

> **DISCLAIMER:** AWS Alien Attack and all resources are provided without any guarantees. We do not recommend using the code for production-grade workloads. This content is provided for learning purposes only. If you wish to re-use any assets or code, please be aware of the licensing terms.

## What is AWS Alien Attack?

AWS Alien Attack is a serverless learn-by-building adventure! 

You can try out serverless architectures for near real-time data processing pipelines on AWS. You can use Alien Attack to experiment with best practices for development, security, databases, Big Data, and IoT.

This repository contains assets to help you implement and explore features within a [Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/).

## Where are the instructions?

You will find instructions to run this workshop at [alienattack.workshop.aws](https://alienattack.workshop.aws). 

You can go through the workshop independently, or work with us for a richer onboarding experience. 

Customers and [AWS Partners](https://aws.amazon.com/partners/) may request a private session (20+ attendees). If you are interested, please contact your respective Account Manager (AM), Partner Development Manager (PDM), AWS Solutions Architect (SA), or AWS Partner Solution Architect (PSA) to request a no-cost Immersion Day based on this workshop.

**Please note:** some parts of this workshop are **not** well-architected. This is intentional and provides opportunities for you to discover and resolve the issues on your own or by working with AWS SAs or Partners.

## What is included in the repository?

* [Infrastructure](infrastructure) folder provides assets to deploy the back-end of the system. This must be deployed first, to set up the infrastructure and obtain the parameters needed to configure the front-end application.
* [Application](application) folder contains the code for the front-end of Alien Attack. You will find resources for two user profiles: 

  * **Gamers** - users generating data by playing the game
  * **Manager** - administrative users who create sessions and review the data

## License

This sample code is licensed under the MIT-0 License. See the LICENSE file.