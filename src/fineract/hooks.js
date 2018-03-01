'use strict';

const Entities = {
    Client: 'CLIENT',
    SavingsAccount: 'SAVINGSACCOUNT',
    AccountTransfer: 'ACCOUNTTRANSFER'
}

const Actions = {
    Create: 'CREATE'
}

const { EventTypes } = require('../common/constants');
const DalaWalletEvent = require('../model/DalaWalletEvent');
const api = require('./api');
const savings = api.savings();
const clients = api.clients();
const transfers = api.accounttransfers();

module.exports.onWebhook = (event, context, callback) => {
    console.log(JSON.stringify(event));
    const body = JSON.parse(event.body);
    const action = event.headers['X-Fineract-Action'];
    const endpoint = event.headers['X-Fineract-Endpoint'];
    const entity = event.headers['X-Fineract-Entity'];

    switch (entity) {
        case Entities.Client:
            return handleClientWebhook();
        case Entities.SavingsAccount:
            return handleSavingsAccountWebhook();
        case Entities.AccountTransfer:
            return handleAccountTransferWebhook();
        default:
            console.log('Unhandled Webhook Event');
            return context.succeed({
                statusCode: 200
            });
    }

    function handleClientWebhook() {
        //get client 
        return clients.get(body.clientId).then(client => {
            const { id, externalId, status, active, firstname, lastname, displayName, activationDate } = client;
            return {
                eventType: `${entity}:${action}`,
                clientId: id,
                username: externalId,
                status: status.value,
                activationDate: {
                    year: activationDate[0],
                    month: activationDate[1],
                    day: activationDate[2]
                },
                firstName: firstname,
                surname: lastname,
                displayName: displayName
            };
        }).then(payload => {
            return new DalaWalletEvent(payload.username, EventTypes.WebhookReceived, payload, context).save();
        }).then(() => {
            return context.succeed({
                statusCode: 200
            });
        })
    }

    function handleSavingsAccountWebhook() {
        return Promise.all([
            clients.get(body.clientId),
            savings.get(body.savingsId)
        ]).then(([client, savings]) => {
            return {
                eventType: `${entity}:${action}`,
                clientId: savings.clientId,
                accountId: savings.id,
                username: savings.externalId,
                accountType: savings.savingsProductName,
                status: savings.status.value,
                balance: savings.summary.accountBalance
            }
        }).then(payload => {
            return new DalaWalletEvent(payload.username, EventTypes.WebhookReceived, payload, context).save();
        }).then(() => {
            return context.succeed({
                statusCode: 200
            });
        })
    }

    function handleAccountTransferWebhook() {
        return transfers.get(body.resourceId).then(transfer => {
            console.log(JSON.stringify(transfer));
            return Promise.all([
                clients.get(transfer.fromClient.id),
                clients.get(transfer.toClient.id),
                savings.get(transfer.fromAccount.id),
                savings.get(transfer.toAccount.id)
            ]).then(([fromClient, toClient, fromAccount, toAccount])=>{
                return {
                    eventType: `${entity}:${action}`,
                    from: {
                        clientId: transfer.fromClient.id,
                        accountId: transfer.fromAccount.id,
                        username: fromAccount.externalId
                    },
                    to: {
                        clientId: transfer.toClient.id,
                        accountId: transfer.toAccount.id,
                        username: toAccount.externalId
                    },
                    amount: transfer.transferAmount,
                    date: {
                        year: transfer.transferDate[0],
                        month: transfer.transferDate[1],
                        day: transfer.transferDate[2]
                    },
                    description: transfer.transferDescription
                }
            })
        }).then(payload => {
            return new DalaWalletEvent(`${payload.from.username}:${payload.to.username}`, EventTypes.WebhookReceived, payload, context).save()
        }).then(() => {
            return context.succeed({
                statusCode: 200
            });
        });
    }
}