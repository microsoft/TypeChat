export type EduType = LabProperties | StudentProperties | CodeProperties | SubscriptionProperties;

export type LabProperties = {
    itemType: 'lab' ,
    operationType: 'create',
    properties: {
        displayName: string,
        description: string,
        expirationDate: string,
        budgetPerStudent: {
            currency: string,
            value: number
        },
        totalBudget: {
            currency: string,
            value: number
        },
        totalAllocatedBudget: {
            currency: string,
            value: number
        }
    }
}

export type StudentProperties = {
    itemType: 'student',
	operationType: 'create',
	properties: {
        studentId: string,
		firstName: string,
		lastName: string,
		email: string,
		role: "Student",
		budget: {
			currency: string,
			value: number
		},
		expirationDate: string,
		subscriptionAlias: string,
		subscriptionInviteLastSentDate: string
	}
}

export type CodeProperties = {
    itemType: 'code',
    redeemCode: string,
    firstName: string,
    lastName: string
}


export type SubscriptionProperties = {
    itemType: 'subscription',
	operationType: 'create',
	properties: {
        alias: string,
		displayName: string,
		workload: "Production",
		billingScope: string,
		additionalProperties: {
			subscriptionTenantId: string,
			subscriptionOwnerId: string
		}	
	}
}