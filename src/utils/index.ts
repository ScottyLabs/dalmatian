export type Session = {
    term: string;
    section: string;
    instructors: string[];
    url: string;
};

export type Course = {
    id: string;
    name: string;
    syllabi: Session[];
    desc: string;
    prereqs: string[];
    prereqString: string;
    coreqs: string[];
    crosslisted: string[];
    units: string;
    department: string;
};

export type GenEd = {
    _id: {
        $oid: string;
    };
    tags: string[];
    courseID: string;
    school: string;
    lastUpdated: string;
    startsCounting: string;
    stopsCounting: string;
};
