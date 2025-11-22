import json

result = {}

with open('CMUsyllabi_processed.json') as f:
    new = json.load(f)

with open('courses.json') as f:
    old = json.load(f)

# "5fb96128486db00d45085b8b":
#         {
#         "_id":
#             {
#                 "$oid": "5fb96128486db00d45085b8b"
#             },
#             "courseID": "48-025",
#             "desc": "The main objective of this first-year seminar course is on how students learn, develop, and make decisions as they transition into architecture education.  The goal of this course is to promote academic success and encourage connections within the SoA and the University at large.  Teaching and learning strategies will be introduced to help support the transition into architecture and the development of independent critical thinkers.   Students will be introduced to campus resources that support their academic/social/personal integration into the campus community.  Topical areas to be covered in the seminar will include academic success strategies in architecture education, academic development, career planning, mentorship, academic and personal support services, and the aspects of professional practice in architecture.",
#             "prereqs": [],
#             "prereqString": "None",
#             "coreqs": [],
#             "crosslisted": [],
#             "name": "First Year Seminar: Architecture Edition",
#             "units": "3.0",
#             "department": "Architecture",
#             "numTerms": 56
#         },

for item in new:
    for match in old.values():
        if match["courseID"][:2] + match["courseID"][3:] == item["id"]:
            id = item['id']
            for tocopy in ["desc", "prereqs", "prereqString", "coreqs", "crosslisted", "units", "department"]:
                item[tocopy] = match[tocopy]
            result[id] = item
            break

with open('finalCourseJSON.json', 'w') as f:
    json.dump(result, f)
