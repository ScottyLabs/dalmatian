CREATE TABLE "my_courses" (
	"user_id" bigint,
	"course_code" text,
	CONSTRAINT "my_courses_pkey" PRIMARY KEY("user_id","course_code")
);
