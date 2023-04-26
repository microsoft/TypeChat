import openai
import os
import time
import yaml
from pykwalify.core import Core

API_KEY = os.getenv("OPENAI_API_KEY")
RESOURCE_ENDPOINT = os.getenv("OPENAI_API_BASE")

openai.api_type = "azure"
openai.api_key = API_KEY
openai.api_base = RESOURCE_ENDPOINT
openai.api_version = "2022-12-01"
deployment = os.getenv("DEPLOYMENT_NAME")
# Call the Azure OpenAI service here

def tryCompletion(prompt):
    for i in range(1, 50):
        try:
            # Create a new completion
            completion = openai.Completion.create(
                engine=deployment,
                prompt=prompt,
                max_tokens=2000
            )

            return(completion)
        except:
            if (i%10 == 0):
                print(f"{i} attempts made.")
            time.sleep(1)
def loadSchema():
    with open('foodOrderSchema.yml', 'r') as file:
        schema = file.read()
        return schema
schemaText = loadSchema()
schema = yaml.safe_load(schemaText)
#print(schema)
with open("example1.yml", "r") as file:
    example1Text = file.read()
example1 = yaml.safe_load(example1Text)
userPrompt = "I would like to order a pizza with pepperoni and a Pale Ale"
prompt =  f"Here is a YAML schema in kwalify format that defines the structure of a food order:\n\n{schemaText}\n\nHere is an example of the output of a food order:\n\n{example1Text}\n\nHere is new food order:\n\n{userPrompt}\n\nHere is the new food order in YAML that conforms to the schema:\n\n"    
completion = tryCompletion(prompt)
yamlPart = completion.choices[0].text
print(yamlPart)
yamlObj = yaml.safe_load(yamlPart)
c = Core(source_data=yamlObj, schema_data=schema)
c.validate(raise_exception=False)
if (c.validation_errors):
    print("Validation failed")
else:
    print("Valid instance")

