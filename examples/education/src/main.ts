import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from 'axios';
import { createLanguageModel, createJsonTranslator, processRequests } from "typechat";
import { EduType } from "./eduSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(process.env);

const eduSchema = fs.readFileSync(path.join(__dirname, "eduSchema.ts"), "utf8");
const eduTranslator = createJsonTranslator<EduType>(model, eduSchema, "EduType");

// Process requests interactively or from the input file specified on the command line
processRequests("> ", process.argv[2], async (request) => {

    const response = await eduTranslator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }

    var token = "<token>";
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    var url = "";
    var billingScope = '/billingAccounts/cd54d304-11db-50e6-9610-ace228b44d19:e37315e3-60e5-4ef4-bea0-d04fea102488_2019-05-31/billingProfiles/7EUE-U7KE-BG7-M77W-SGB/invoiceSections/AWGN-BIF3-PJA-MAOR-SGB';
    
    switch (response.data.itemType) {
        case "subscription": { 
            switch(response.data.operationType){     
                case "create":{      
                    response.data.properties.displayName = 'LLM Subscription';
                    response.data.properties.alias = 'XDAASDSDYZ';
                    response.data.properties.billingScope = billingScope;
                    response.data.properties.additionalProperties.subscriptionOwnerId = "7a418809-3965-474e-aa15-d57d7c583559";
                    response.data.properties.additionalProperties.subscriptionTenantId = "0a27a8c9-d70e-486c-995e-31d58763bf35";
                    
                    url = 'https://management.azure.com/providers/Microsoft.Subscription/aliases/'+response.data.properties.alias+'?api-version=2021-01-01-privatepreview';
                    await axios.put(url, response.data);
                    //console.log(res.data); 

                    break;
                }
                //... other subscription cases
            }
            break;    
        }
        case "student": {       
            switch(response.data.operationType){
                case "create":{
                    response.data.properties.email = 'saubhatt@microsoft.com';
                    response.data.properties.firstName = 'first name';
                    response.data.properties.lastName = 'last name';
                    response.data.properties.budget.value = 100;
                    response.data.properties.budget.currency = "USD";
                    response.data.properties.expirationDate = "2023-12-31";
                    
                    url = 'https://management.azure.com/providers/Microsoft.Billing'+ billingScope +'/providers/Microsoft.Education/labs/default/students/'+ response.data.properties.email +'?api-version=2022-10-01-preview';
                    await axios.put(url, response.data);
                    //console.log(res.data); 
                    
                    break;  
                }
                //... other student cases
            }  
            break;         
        }         
        case "lab": {
            switch(response.data.operationType){
                case "create":   {                
                    response.data.properties.description="default";
                    response.data.properties.totalAllocatedBudget.currency = "USD";
                    response.data.properties.totalBudget.currency = "USD";
                    response.data.properties.budgetPerStudent.currency = "USD";

                    url = 'https://management.azure.com/providers/Microsoft.Billing'+ billingScope +'/providers/Microsoft.Education/labs/default?api-version=2022-10-01-preview';
                    await axios.put(url, response.data);
                    //console.log(res.data);   
                    
                    break; 
                }
                //... other lab cases
            }
            break;  
        }        
        //... other edu cases        
    }

    //console.log(`\n${JSON.stringify(response.data, null, 2)}`);    
    
});
