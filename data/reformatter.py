import json

result = []

with open('CMUsyllabi.json') as f:
    d = json.load(f)

for coursecode in d:
    item = {}
    item["id"] = str(coursecode)
    item["name"] = d[coursecode][0]
    item["syllabi"] = []
    for pclass in d[coursecode][1]:
        courseterm = {}
        courseterm["term"] = pclass[0]
        # stringparse to get the section
        courseterm["section"] = pclass[1].split()[0].split('-')[1]
        inslist = (pclass[1].split('(')[1])[:-1]
        courseterm["instructors"] = []
        for instructor in inslist.split(', '):
            courseterm["instructors"].append(instructor)
        courseterm["url"] = pclass[2]
        item['syllabi'].append(courseterm)
    result.append(item)

with open('CMUsyllabi_processed.json', 'w') as f:
    json.dump(result, f)


# SAMPLE JSON:
# [
#     {
#         "id": "15213",
#         "name": "Introduction to Computer Systems",
#         "syllabi": [
#             {
#                 "term": "F22",
#                 "section": "1",
#                 "instructors": ["Andersen", "Railing", "Weinberg"],
#                 "url": "https://canvas.cmu.edu/courses/30096/modules/items/5260322"
#             }
#             // OTHER ENTRIES OMITTED
#         ]
#     }
#     // OTHER ENTRIES OMITTED
# ]
