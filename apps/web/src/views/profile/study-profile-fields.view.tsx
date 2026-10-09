import {
  profileLimits,
  studyModeOptions,
  studyTimeOptions,
  type StudyProfileErrors,
  type StudyProfileFormValues,
} from "@/models/profile/study-profile.model";

interface StudyProfileFieldsProps {
  readonly values: StudyProfileFormValues;
  readonly errors?: StudyProfileErrors;
}

const yearOptions = Array.from(
  { length: profileLimits.yearOfStudyMax },
  (_, index) => index + 1,
);

function FieldMessage({
  id,
  error,
  hint,
}: {
  readonly id: string;
  readonly error?: string;
  readonly hint?: string;
}) {
  if (error) {
    return (
      <p className="field-error" id={`${id}-error`}>
        {error}
      </p>
    );
  }

  return hint ? (
    <p className="field-hint" id={`${id}-hint`}>
      {hint}
    </p>
  ) : null;
}

function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

/**
 * Study profile inputs shared by sign-up and the profile page. Uncontrolled,
 * so the surrounding form reads them directly from FormData.
 */
export function StudyProfileFields({ values, errors = {} }: StudyProfileFieldsProps) {
  const interestsHint =
    "Separate with commas, e.g. Databases, Machine Learning. Used to match study partners.";

  return (
    <>
      <div className="profile-form-grid">
        <div className="form-field">
          <label htmlFor="academicMajor">Programme / major</label>
          <input
            id="academicMajor"
            name="academicMajor"
            defaultValue={values.academicMajor}
            maxLength={profileLimits.majorMax}
            placeholder="e.g. Software Engineering"
            aria-invalid={errors.academicMajor ? true : undefined}
            aria-describedby={describedBy("academicMajor", errors.academicMajor)}
          />
          <FieldMessage id="academicMajor" error={errors.academicMajor} />
        </div>

        <div className="form-field">
          <label htmlFor="yearOfStudy">Year of study</label>
          <select
            id="yearOfStudy"
            name="yearOfStudy"
            defaultValue={values.yearOfStudy}
            aria-invalid={errors.yearOfStudy ? true : undefined}
            aria-describedby={describedBy("yearOfStudy", errors.yearOfStudy)}
          >
            <option value="">Not specified</option>
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                Year {option}
              </option>
            ))}
          </select>
          <FieldMessage id="yearOfStudy" error={errors.yearOfStudy} />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="interests">Learning interests</label>
        <input
          id="interests"
          name="interests"
          defaultValue={values.interests}
          aria-invalid={errors.interests ? true : undefined}
          aria-describedby={describedBy("interests", errors.interests, interestsHint)}
        />
        <FieldMessage id="interests" error={errors.interests} hint={interestsHint} />
      </div>

      <fieldset
        className="choice-group"
        aria-describedby={describedBy("studyTimes", errors.studyTimes)}
      >
        <legend>When do you prefer to study?</legend>
        <div className="choice-options">
          {studyTimeOptions.map((option) => (
            <label className="choice-chip" key={option.value}>
              <input
                type="checkbox"
                name="studyTimes"
                value={option.value}
                defaultChecked={values.studyTimes.includes(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <FieldMessage id="studyTimes" error={errors.studyTimes} />
      </fieldset>

      <fieldset
        className="choice-group"
        aria-describedby={describedBy("studyMode", errors.studyMode)}
      >
        <legend>How do you like to study with others?</legend>
        <div className="choice-options">
          {studyModeOptions.map((option) => (
            <label className="choice-chip" key={option.value}>
              <input
                type="radio"
                name="studyMode"
                value={option.value}
                defaultChecked={values.studyMode === option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <FieldMessage id="studyMode" error={errors.studyMode} />
      </fieldset>

      <label className="checkbox-field">
        <input
          type="checkbox"
          name="isDiscoverable"
          defaultChecked={values.isDiscoverable}
        />
        <span>
          <strong>Show me in peer search</strong>
          <small>Let other students find and connect with you.</small>
        </span>
      </label>
    </>
  );
}
